import { describe, expect, it } from "vitest";
import type { Env } from "../../../src/env/index.js";
import type { TryUploadParams } from "../../../src/action/artifact-upload.js";
import { tryUploadFullReport } from "../../../src/action/artifact-upload.js";
import type { ArtifactTransport } from "../../../src/artifact/types.js";
import { nullLogger, capturingLogger } from "../../helpers/logger.js";

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

const TOKEN = buildJwt("run-id", "job-id");
const RESULTS_URL = "https://results-receiver.actions.githubusercontent.com/";

function baseEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return {
    ACTIONS_RUNTIME_TOKEN: TOKEN,
    ACTIONS_RESULTS_URL: RESULTS_URL,
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_RUN_ID: "12345",
    GITHUB_REPOSITORY: "owner/repo",
    ...overrides,
  } as Env;
}

/**
 * Mock transport that responds to the 3-step upload sequence:
 * CreateArtifact → blob → FinalizeArtifact
 */
function sequenceTransport(artifactId = 42): ArtifactTransport {
  let step = 0;
  return () => {
    step++;
    if (step === 1) {
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
      return Promise.resolve({ status: 201, headers: {}, body: "" });
    }
    return Promise.resolve({
      status: 200,
      headers: {},
      body: JSON.stringify({ ok: true, artifact_id: String(artifactId) }),
    });
  };
}

function baseParams(overrides: Partial<TryUploadParams> = {}): TryUploadParams {
  return {
    htmlContent: "<h1>Plan</h1>\n<p>3 to add</p>",
    env: baseEnv(),
    artifactName: "cluster-plan-report.html",
    logger: nullLogger(),
    deps: {
      transport: sequenceTransport(),
      sleep: async () => {
        /* no-op */
      },
    },
    ...overrides,
  };
}

describe("tryUploadFullReport", () => {
  it("returns artifact URL on success", async () => {
    const url = await tryUploadFullReport(baseParams());
    expect(url).toBe(
      "https://github.com/owner/repo/actions/runs/12345/artifacts/42",
    );
  });

  it("includes artifact name in the URL path", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        deps: {
          transport: sequenceTransport(999),
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );
    expect(url).toContain("/artifacts/999");
  });

  it("returns undefined when ACTIONS_RUNTIME_TOKEN is missing", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ ACTIONS_RUNTIME_TOKEN: undefined }),
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when ACTIONS_RUNTIME_TOKEN is empty", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ ACTIONS_RUNTIME_TOKEN: "" }),
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when ACTIONS_RESULTS_URL is missing", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ ACTIONS_RESULTS_URL: undefined }),
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when GITHUB_RUN_ID is missing", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ GITHUB_RUN_ID: undefined }),
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when upload transport fails", async () => {
    const failTransport: ArtifactTransport = () =>
      Promise.resolve({
        status: 500,
        headers: {},
        body: "Internal Server Error",
      });

    const { logger, messages } = capturingLogger();
    const url = await tryUploadFullReport(
      baseParams({
        deps: {
          transport: failTransport,
          sleep: async () => {
            /* no-op */
          },
        },
        logger,
      }),
    );
    expect(url).toBeUndefined();
    expect(messages.warnings).toHaveLength(1);
    expect(messages.warnings[0]).toContain("Artifact upload failed");
  });

  it("returns undefined when GHES guard rejects", async () => {
    const { logger, messages } = capturingLogger();
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ GITHUB_SERVER_URL: "https://github.mycompany.com" }),
        logger,
      }),
    );
    expect(url).toBeUndefined();
    expect(messages.warnings).toHaveLength(1);
    expect(messages.warnings[0]).toContain("github.mycompany.com");
  });

  it("passes injected transport through to uploader", async () => {
    const requests: string[] = [];
    const trackingTransport: ArtifactTransport = (method, url) => {
      requests.push(`${method} ${url}`);
      if (requests.length === 1) {
        return Promise.resolve({
          status: 200,
          headers: {},
          body: JSON.stringify({
            ok: true,
            signed_upload_url: "https://blob.example.com/upload",
          }),
        });
      }
      if (requests.length === 2) {
        return Promise.resolve({ status: 201, headers: {}, body: "" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, artifact_id: "1" }),
      });
    };

    await tryUploadFullReport(
      baseParams({
        deps: {
          transport: trackingTransport,
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatch(/^POST/);
    expect(requests[1]).toMatch(/^PUT/);
    expect(requests[2]).toMatch(/^POST/);
  });

  it("wraps htmlContent in a full HTML page", async () => {
    let blobBody = "";
    let callCount = 0;
    const capturingTransport: ArtifactTransport = (
      _method,
      _url,
      _headers,
      body,
    ) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          headers: {},
          body: JSON.stringify({
            ok: true,
            signed_upload_url: "https://blob.example.com/upload?sig=test",
          }),
        });
      }
      if (callCount === 2) {
        blobBody = body ?? "";
        return Promise.resolve({ status: 201, headers: {}, body: "" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, artifact_id: "1" }),
      });
    };

    await tryUploadFullReport(
      baseParams({
        htmlContent: "<h2>Test Report</h2><p>Details here</p>",
        deps: {
          transport: capturingTransport,
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );

    expect(blobBody).toContain("<!DOCTYPE html>");
    expect(blobBody).toContain("<h2>Test Report</h2><p>Details here</p>");
  });

  it("strips .html extension from the HTML page <title>", async () => {
    let blobBody = "";
    let callCount = 0;
    const capturingTransport: ArtifactTransport = (
      _method,
      _url,
      _headers,
      body,
    ) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          headers: {},
          body: JSON.stringify({
            ok: true,
            signed_upload_url: "https://blob.example.com/upload?sig=test",
          }),
        });
      }
      if (callCount === 2) {
        blobBody = body ?? "";
        return Promise.resolve({ status: 201, headers: {}, body: "" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, artifact_id: "1" }),
      });
    };

    await tryUploadFullReport(
      baseParams({
        artifactName: "cluster-plan-report.html",
        deps: {
          transport: capturingTransport,
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );

    expect(blobBody).toContain("<title>cluster-plan-report</title>");
    expect(blobBody).not.toContain("<title>cluster-plan-report.html</title>");
  });

  it("sends text/html Content-Type for .html artifact name", async () => {
    const createArtifactBodies: string[] = [];
    let callCount = 0;
    const capturingTransport: ArtifactTransport = (
      _method,
      _url,
      _headers,
      body,
    ) => {
      callCount++;
      if (callCount === 1) {
        createArtifactBodies.push(body ?? "");
        return Promise.resolve({
          status: 200,
          headers: {},
          body: JSON.stringify({
            ok: true,
            signed_upload_url: "https://blob.example.com/upload?sig=test",
          }),
        });
      }
      if (callCount === 2) {
        return Promise.resolve({ status: 201, headers: {}, body: "" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, artifact_id: "1" }),
      });
    };

    await tryUploadFullReport(
      baseParams({
        artifactName: "cluster-plan-report.html",
        deps: {
          transport: capturingTransport,
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );

    expect(createArtifactBodies).toHaveLength(1);
    const parsed = JSON.parse(createArtifactBodies[0] ?? "{}") as Record<
      string,
      unknown
    >;
    expect(parsed["mime_type"]).toBe("text/html");
  });

  it("uses GITHUB_REPOSITORY for artifact URL path", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ GITHUB_REPOSITORY: "myorg/myrepo" }),
      }),
    );
    expect(url).toContain("myorg/myrepo");
  });

  it("uses GITHUB_SERVER_URL in the artifact URL", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ GITHUB_SERVER_URL: "https://myorg.ghe.com" }),
      }),
    );
    expect(url).toContain("https://myorg.ghe.com/");
  });
});
