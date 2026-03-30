import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createArtifactUploader } from "../../../src/artifact/upload.js";
import type { ArtifactTransport } from "../../../src/artifact/types.js";

/** Build a JWT with a valid Actions.Results scope. */
function buildJwt(runId: string, jobId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ scp: `Actions.Results:${runId}:${jobId}` }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

const RUN_ID = "run-backend-id";
const JOB_ID = "job-backend-id";
const TOKEN = buildJwt(RUN_ID, JOB_ID);
const RESULTS_URL = "https://results-receiver.actions.githubusercontent.com/";

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

/**
 * Build a mock transport that responds to the 3-step upload sequence:
 * 1. POST CreateArtifact → signed_upload_url
 * 2. PUT blob → 201
 * 3. POST FinalizeArtifact → artifact_id
 */
function sequenceTransport(artifactId = 42): {
  transport: ArtifactTransport;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  let step = 0;

  const transport: ArtifactTransport = (method, url, headers, body) => {
    requests.push({ method, url, headers, body });
    step++;

    if (step === 1) {
      // CreateArtifact
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({
          ok: true,
          signed_upload_url: "https://blob.example.com/upload?sig=test",
        }),
      });
    }
    if (step === 2) {
      // Blob upload
      return Promise.resolve({ status: 201, headers: {}, body: "" });
    }
    // FinalizeArtifact
    return Promise.resolve({
      status: 200,
      headers: {},
      body: JSON.stringify({ ok: true, artifact_id: String(artifactId) }),
    });
  };

  return { transport, requests };
}

describe("createArtifactUploader", () => {
  // A-20: injected transport is called
  it("uses the injected transport for all HTTP calls", async () => {
    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test-artifact",
      filename: "report.html",
      content: "hello",
    });

    expect(requests).toHaveLength(3);
    expect(requests[0]!.method).toBe("POST"); // CreateArtifact
    expect(requests[1]!.method).toBe("PUT"); // Blob upload
    expect(requests[2]!.method).toBe("POST"); // FinalizeArtifact
  });

  // A-11: SHA-256 computed over UTF-8 bytes matches expected digest
  it("computes correct SHA-256 hash", async () => {
    const content = "hello world";
    const expectedHash = createHash("sha256")
      .update(content, "utf-8")
      .digest("hex");

    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content,
    });

    expect(result.sha256).toBe(expectedHash);

    // Verify FinalizeArtifact request has the hash with prefix
    const finalizeBody = JSON.parse(requests[2]!.body!) as Record<
      string,
      unknown
    >;
    expect(finalizeBody["hash"]).toEqual({
      value: `sha256:${expectedHash}`,
    });
  });

  // A-21: injected createHash is used
  it("uses injected createHash for SHA-256 computation", async () => {
    let hashCalled = false;
    const fakeCreateHash = (algorithm: string) => {
      hashCalled = true;
      expect(algorithm).toBe("sha256");
      return createHash("sha256");
    };

    const { transport } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      createHash: fakeCreateHash,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    expect(hashCalled).toBe(true);
  });

  // A-12: size as string (byte length, not char length)
  it("sends size as a string in FinalizeArtifact", async () => {
    const content = "hello";
    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test",
      filename: "report.html",
      content,
    });

    const finalizeBody = JSON.parse(requests[2]!.body!) as Record<
      string,
      unknown
    >;
    expect(finalizeBody["size"]).toBe("5");
    expect(typeof finalizeBody["size"]).toBe("string");
  });

  // A-24: multi-byte string produces correct byte length
  it("uses UTF-8 byte length for multi-byte content", async () => {
    // "🎉" is 4 bytes in UTF-8, "é" is 2 bytes
    const content = "héllo 🎉";
    const expectedSize = Buffer.byteLength(content, "utf-8");

    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content,
    });

    expect(result.size).toBe(expectedSize);

    const finalizeBody = JSON.parse(requests[2]!.body!) as Record<
      string,
      unknown
    >;
    expect(finalizeBody["size"]).toBe(String(expectedSize));
  });

  // A-14: artifactId returned as number
  it("returns artifactId as a number", async () => {
    const { transport } = sequenceTransport(999);
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    expect(result.id).toBe(999);
    expect(typeof result.id).toBe("number");
  });

  // A-22: GHES guard throws for unsupported server
  it("throws when serverUrl is not github.com or *.ghe.com", async () => {
    const { transport } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      serverUrl: "https://github.mycompany.com",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await expect(
      uploader.upload({
        name: "test",
        filename: "report.html",
        content: "data",
      }),
    ).rejects.toThrow("not supported");
  });

  // A-23: allows github.com and *.ghe.com
  it("allows github.com", async () => {
    const { transport } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      serverUrl: "https://github.com",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    expect(result.id).toBe(42);
  });

  it("allows *.ghe.com subdomains", async () => {
    const { transport } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      serverUrl: "https://myorg.ghe.com",
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    expect(result.id).toBe(42);
  });

  it("defaults serverUrl to github.com when not provided", async () => {
    const { transport } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    const result = await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    expect(result.id).toBe(42);
  });

  it("detects text/html MIME type for .html files", async () => {
    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test",
      filename: "report.html",
      content: "data",
    });

    // Blob upload is the 2nd request
    expect(requests[1]!.headers["Content-Type"]).toBe("text/html");
  });

  it("detects text/markdown MIME type for .md files", async () => {
    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test",
      filename: "report.md",
      content: "data",
    });

    expect(requests[1]!.headers["Content-Type"]).toBe("text/markdown");
  });

  it("uses application/octet-stream for unknown extensions", async () => {
    const { transport, requests } = sequenceTransport();
    const uploader = createArtifactUploader({
      runtimeToken: TOKEN,
      resultsUrl: RESULTS_URL,
      transport,
      sleep: async () => {
        /* no-op */
      },
    });

    await uploader.upload({
      name: "test",
      filename: "data.bin",
      content: "data",
    });

    expect(requests[1]!.headers["Content-Type"]).toBe(
      "application/octet-stream",
    );
  });
});
