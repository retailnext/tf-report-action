import { describe, expect, it } from "vitest";
import { ActionsError } from "../../../src/http/index.js";
import {
  createArtifact,
  finalizeArtifact,
} from "../../../src/artifact/twirp.js";
import type { TwirpDeps } from "../../../src/artifact/twirp.js";
import type { ArtifactTransport } from "../../../src/artifact/types.js";

const RESULTS_URL = "https://results-receiver.actions.githubusercontent.com/";
const TOKEN = "test-token";
const BACKEND_IDS = {
  workflowRunBackendId: "run-id-123",
  workflowJobRunBackendId: "job-id-456",
};

interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function mockTransport(
  status: number,
  responseBody: string,
): { transport: ArtifactTransport; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const transport: ArtifactTransport = (method, url, headers, body) => {
    requests.push({ method, url, headers, body });
    return Promise.resolve({ status, headers: {}, body: responseBody });
  };
  return { transport, requests };
}

function baseDeps(transport: ArtifactTransport): TwirpDeps {
  return {
    resultsUrl: RESULTS_URL,
    runtimeToken: TOKEN,
    transport,
    sleep: async () => {
      /* no-op */
    },
  };
}

describe("createArtifact", () => {
  // The real API returns snake_case field names
  const successBody = JSON.stringify({
    ok: true,
    signed_upload_url: "https://storage.blob.core.windows.net/artifact?sig=abc",
  });

  // A-4: POST to correct Twirp URL with JSON body
  it("sends POST to the correct Twirp URL", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await createArtifact(baseDeps(transport), {
      name: "test-artifact",
      backendIds: BACKEND_IDS,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.url).toBe(
      "https://results-receiver.actions.githubusercontent.com/twirp/" +
        "github.actions.results.api.v1.ArtifactService/CreateArtifact",
    );
  });

  // A-5: includes Authorization: Bearer <token>
  it("includes Bearer authorization header", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await createArtifact(baseDeps(transport), {
      name: "test-artifact",
      backendIds: BACKEND_IDS,
    });

    expect(requests[0]!.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  // A-6: request body includes version: 7
  it("sends version 7 in the request body", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await createArtifact(baseDeps(transport), {
      name: "my-artifact",
      backendIds: BACKEND_IDS,
    });

    const body = JSON.parse(requests[0]!.body!) as Record<string, unknown>;
    expect(body["version"]).toBe(7);
    expect(body["name"]).toBe("my-artifact");
    expect(body["workflow_run_backend_id"]).toBe(
      BACKEND_IDS.workflowRunBackendId,
    );
    expect(body["workflow_job_run_backend_id"]).toBe(
      BACKEND_IDS.workflowJobRunBackendId,
    );
  });

  it("includes mime_type in the request body when provided", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await createArtifact(baseDeps(transport), {
      name: "test-artifact",
      backendIds: BACKEND_IDS,
      mimeType: "text/html",
    });

    const body = JSON.parse(requests[0]!.body!) as Record<string, unknown>;
    expect(body["mime_type"]).toBe("text/html");
  });

  it("omits mime_type from the request body when not provided", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await createArtifact(baseDeps(transport), {
      name: "test-artifact",
      backendIds: BACKEND_IDS,
    });

    const body = JSON.parse(requests[0]!.body!) as Record<string, unknown>;
    expect(body).not.toHaveProperty("mime_type");
  });

  it("returns the signed upload URL", async () => {
    const { transport } = mockTransport(200, successBody);
    const result = await createArtifact(baseDeps(transport), {
      name: "test",
      backendIds: BACKEND_IDS,
    });

    expect(result.signedUploadUrl).toBe(
      "https://storage.blob.core.windows.net/artifact?sig=abc",
    );
  });

  // A-7: non-2xx throws error
  it("throws on non-2xx response", async () => {
    const errorBody = JSON.stringify({
      code: "invalid_argument",
      msg: "bad request",
    });
    const { transport } = mockTransport(400, errorBody);
    await expect(
      createArtifact(baseDeps(transport), {
        name: "test",
        backendIds: BACKEND_IDS,
      }),
    ).rejects.toThrow(ActionsError);
  });

  it("throws when response is missing signedUploadUrl", async () => {
    const { transport } = mockTransport(200, JSON.stringify({ ok: true }));
    await expect(
      createArtifact(baseDeps(transport), {
        name: "test",
        backendIds: BACKEND_IDS,
      }),
    ).rejects.toThrow("missing signed_upload_url");
  });
});

describe("finalizeArtifact", () => {
  // The real API returns snake_case field names
  const successBody = JSON.stringify({
    ok: true,
    artifact_id: "987654321",
  });

  it("sends correct request body with size as string and hash prefix", async () => {
    const { transport, requests } = mockTransport(200, successBody);
    await finalizeArtifact(baseDeps(transport), {
      name: "test-artifact",
      backendIds: BACKEND_IDS,
      size: 1234,
      sha256Hex: "abc123def456",
    });

    const body = JSON.parse(requests[0]!.body!) as Record<string, unknown>;
    // A-12: size as string
    expect(body["size"]).toBe("1234");
    // A-13: hash as plain string (protobuf StringValue → raw string in JSON)
    expect(body["hash"]).toBe("sha256:abc123def456");
    expect(body["name"]).toBe("test-artifact");
  });

  // A-14: artifactId returned as number
  it("returns artifactId as a number", async () => {
    const { transport } = mockTransport(200, successBody);
    const result = await finalizeArtifact(baseDeps(transport), {
      name: "test",
      backendIds: BACKEND_IDS,
      size: 100,
      sha256Hex: "abc",
    });

    expect(result.artifactId).toBe(987654321);
    expect(typeof result.artifactId).toBe("number");
  });

  it("handles numeric artifact_id in response", async () => {
    const body = JSON.stringify({ ok: true, artifact_id: 42 });
    const { transport } = mockTransport(200, body);
    const result = await finalizeArtifact(baseDeps(transport), {
      name: "test",
      backendIds: BACKEND_IDS,
      size: 100,
      sha256Hex: "abc",
    });

    expect(result.artifactId).toBe(42);
  });

  it("throws when artifactId is missing", async () => {
    const body = JSON.stringify({ ok: true });
    const { transport } = mockTransport(200, body);
    await expect(
      finalizeArtifact(baseDeps(transport), {
        name: "test",
        backendIds: BACKEND_IDS,
        size: 100,
        sha256Hex: "abc",
      }),
    ).rejects.toThrow("invalid artifactId");
  });
});

describe("retry behavior", () => {
  // A-15: retries on 502
  it("retries on 502 up to max attempts", async () => {
    const requests: CapturedRequest[] = [];
    let callCount = 0;
    const transport: ArtifactTransport = (method, url, headers, body) => {
      requests.push({ method, url, headers, body });
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          status: 502,
          headers: {},
          body: "Bad Gateway",
        });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({
          ok: true,
          signed_upload_url: "https://blob.example.com/upload",
        }),
      });
    };

    const result = await createArtifact(baseDeps(transport), {
      name: "test",
      backendIds: BACKEND_IDS,
    });

    expect(requests).toHaveLength(3);
    expect(result.signedUploadUrl).toBe("https://blob.example.com/upload");
  });

  // A-16: does not retry on 400
  it("does not retry on 400", async () => {
    const requests: CapturedRequest[] = [];
    const transport: ArtifactTransport = (method, url, headers, body) => {
      requests.push({ method, url, headers, body });
      return Promise.resolve({ status: 400, headers: {}, body: "Bad Request" });
    };

    await expect(
      createArtifact(baseDeps(transport), {
        name: "test",
        backendIds: BACKEND_IDS,
      }),
    ).rejects.toThrow(ActionsError);

    expect(requests).toHaveLength(1);
  });

  // A-17: retries on 429
  it("retries on 429", async () => {
    let callCount = 0;
    const transport: ArtifactTransport = () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 429,
          headers: {},
          body: "Too Many Requests",
        });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({
          ok: true,
          signed_upload_url: "https://blob.example.com/upload",
        }),
      });
    };

    const result = await createArtifact(baseDeps(transport), {
      name: "test",
      backendIds: BACKEND_IDS,
    });

    expect(callCount).toBe(2);
    expect(result.signedUploadUrl).toBe("https://blob.example.com/upload");
  });

  // A-18: backoff increases
  it("passes increasing sleep delays", async () => {
    const delays: number[] = [];
    let callCount = 0;
    const transport: ArtifactTransport = () => {
      callCount++;
      if (callCount <= 3) {
        return Promise.resolve({ status: 502, headers: {}, body: "error" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({
          ok: true,
          signed_upload_url: "https://blob.example.com/upload",
        }),
      });
    };

    await createArtifact(
      {
        resultsUrl: RESULTS_URL,
        runtimeToken: TOKEN,
        transport,
        sleep: (ms: number) => {
          delays.push(ms);
          return Promise.resolve();
        },
      },
      { name: "test", backendIds: BACKEND_IDS },
    );

    expect(delays).toHaveLength(3);
    // Each delay should be greater than the previous (exponential backoff)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  // A-19: after max retries, throws
  it("throws after max retries with descriptive error", async () => {
    const transport: ArtifactTransport = () =>
      Promise.resolve({
        status: 502,
        headers: {},
        body: "Bad Gateway",
      });

    await expect(
      createArtifact(baseDeps(transport), {
        name: "test",
        backendIds: BACKEND_IDS,
      }),
    ).rejects.toThrow(/502/);
  });
});
