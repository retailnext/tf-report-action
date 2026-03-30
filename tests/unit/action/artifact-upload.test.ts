import { describe, expect, it } from "vitest";
import type { Env } from "../../../src/env/index.js";
import type { TryUploadParams } from "../../../src/action/artifact-upload.js";
import { tryUploadFullReport } from "../../../src/action/artifact-upload.js";
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

const TOKEN = buildJwt("run-id", "job-id");
const RESULTS_URL = "https://results-receiver.actions.githubusercontent.com/";

function baseEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return {
    ACTIONS_RUNTIME_TOKEN: TOKEN,
    ACTIONS_RESULTS_URL: RESULTS_URL,
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_RUN_ID: "12345",
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
          signedUploadUrl: "https://blob.example.com/upload?sig=test",
        }),
      });
    }
    if (step === 2) {
      return Promise.resolve({ status: 201, headers: {}, body: "" });
    }
    return Promise.resolve({
      status: 200,
      headers: {},
      body: JSON.stringify({ ok: true, artifactId: String(artifactId) }),
    });
  };
}

function fakeRenderMarkdown(): (params: {
  text: string;
  mode: "gfm";
  context: string;
}) => Promise<string> {
  return (params) =>
    Promise.resolve(`<p>Rendered: ${params.text.slice(0, 20)}</p>`);
}

function baseParams(overrides: Partial<TryUploadParams> = {}): TryUploadParams {
  return {
    fullMarkdown: "# Plan\n\n3 to add",
    renderMarkdown: fakeRenderMarkdown(),
    env: baseEnv(),
    repoContext: "owner/repo",
    artifactName: "cluster-plan",
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

  it("returns undefined when renderMarkdown throws", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        renderMarkdown: () => Promise.reject(new Error("API error")),
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when upload fails", async () => {
    const failTransport: ArtifactTransport = () =>
      Promise.resolve({
        status: 500,
        headers: {},
        body: "Internal Server Error",
      });

    const url = await tryUploadFullReport(
      baseParams({
        deps: {
          transport: failTransport,
          sleep: async () => {
            /* no-op */
          },
        },
      }),
    );
    expect(url).toBeUndefined();
  });

  it("returns undefined when GHES guard rejects", async () => {
    const url = await tryUploadFullReport(
      baseParams({
        env: baseEnv({ GITHUB_SERVER_URL: "https://github.mycompany.com" }),
      }),
    );
    expect(url).toBeUndefined();
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
            signedUploadUrl: "https://blob.example.com/upload",
          }),
        });
      }
      if (requests.length === 2) {
        return Promise.resolve({ status: 201, headers: {}, body: "" });
      }
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ ok: true, artifactId: "1" }),
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

  it("passes fullMarkdown to renderMarkdown", async () => {
    let capturedText = "";
    const url = await tryUploadFullReport(
      baseParams({
        fullMarkdown: "# Full Report Content",
        renderMarkdown: (params) => {
          capturedText = params.text;
          return Promise.resolve("<h1>Full Report Content</h1>");
        },
      }),
    );

    expect(url).toBeDefined();
    expect(capturedText).toBe("# Full Report Content");
  });

  it("passes repoContext to renderMarkdown", async () => {
    let capturedContext = "";
    await tryUploadFullReport(
      baseParams({
        repoContext: "myorg/myrepo",
        renderMarkdown: (params) => {
          capturedContext = params.context;
          return Promise.resolve("<p>html</p>");
        },
      }),
    );

    expect(capturedContext).toBe("myorg/myrepo");
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
