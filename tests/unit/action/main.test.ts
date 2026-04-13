import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { run } from "../../../src/action/main.js";
import { formatTimestamp } from "../../../src/comment/footer.js";
import type { Env } from "../../../src/env/index.js";
import type {
  GitHubClient,
  Comment,
  SearchIssue,
} from "../../../src/github/index.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { nullLogger, capturingLogger } from "../../helpers/logger.js";
import type { RunDeps } from "../../../src/action/main.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sentinel error thrown by the fake exit function. */
class ExitError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`process.exit(${String(code)})`);
    this.code = code;
  }
}

/** Fake exit function that throws instead of terminating the process. */
function throwingExit(code: number): never {
  throw new ExitError(code);
}

/** Default deps that suppress all output and throw on exit. */
function quietDeps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    logger: nullLogger(),
    exit: throwingExit,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TrackedClient {
  client: GitHubClient;
  calls: {
    getComments: unknown[][];
    deleteComment: unknown[][];
    postComment: unknown[][];
    searchIssues: unknown[][];
    createIssue: unknown[][];
    updateIssue: unknown[][];
    renderMarkdown: unknown[][];
  };
}

function mockClient(overrides: Partial<GitHubClient> = {}): TrackedClient {
  const calls = {
    getComments: [] as unknown[][],
    deleteComment: [] as unknown[][],
    postComment: [] as unknown[][],
    searchIssues: [] as unknown[][],
    createIssue: [] as unknown[][],
    updateIssue: [] as unknown[][],
    renderMarkdown: [] as unknown[][],
  };

  const client: GitHubClient = {
    getComments:
      overrides.getComments ??
      ((...args) => {
        calls.getComments.push(args);
        return Promise.resolve([]);
      }),
    deleteComment:
      overrides.deleteComment ??
      ((...args) => {
        calls.deleteComment.push(args);
        return Promise.resolve();
      }),
    postComment:
      overrides.postComment ??
      ((...args) => {
        calls.postComment.push(args);
        return Promise.resolve();
      }),
    searchIssues:
      overrides.searchIssues ??
      ((...args) => {
        calls.searchIssues.push(args);
        return Promise.resolve([]);
      }),
    createIssue:
      overrides.createIssue ??
      ((...args) => {
        calls.createIssue.push(args);
        return Promise.resolve(1);
      }),
    updateIssue:
      overrides.updateIssue ??
      ((...args) => {
        calls.updateIssue.push(args);
        return Promise.resolve();
      }),
    renderMarkdown:
      overrides.renderMarkdown ??
      ((...args) => {
        calls.renderMarkdown.push(args);
        return Promise.resolve("<p>rendered</p>");
      }),
  };

  return { client, calls };
}

function baseEnv(extra: Env = {}): Env {
  return {
    INPUT_STEPS:
      '{"init":{"outcome":"success","conclusion":"success","outputs":{}}}',
    "INPUT_GITHUB-TOKEN": "ghp_test",
    GITHUB_REPOSITORY: "owner/repo",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW: "CI",
    GITHUB_JOB: "plan",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe("formatTimestamp", () => {
  it("formats a known date in UTC", () => {
    const date = new Date("2026-01-22T19:05:00Z");
    expect(formatTimestamp(date)).toBe("January 22, 2026 at 19:05 UTC");
  });

  it("zero-pads hours and minutes", () => {
    const date = new Date("2025-03-01T03:07:00Z");
    expect(formatTimestamp(date)).toBe("March 1, 2025 at 03:07 UTC");
  });
});

// ---------------------------------------------------------------------------
// run — non-PR flow (issue create/update)
// ---------------------------------------------------------------------------

describe("run — non-PR flow", () => {
  it("creates a new status issue when none exists", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(baseEnv(), quietDeps({ clientFactory: factory }));

    expect(calls.searchIssues).toHaveLength(1);
    expect(calls.createIssue).toHaveLength(1);
    const [owner, repo, title, body] = calls.createIssue[0] as [
      string,
      string,
      string,
      string,
    ];
    expect(owner).toBe("owner");
    expect(repo).toBe("repo");
    expect(title).toBe(":bar_chart: `CI/plan` Status");
    expect(body).toContain("<!-- tf-report-action:");
    expect(body).toContain("[View logs]");
    expect(body).toContain("Last updated:");
  });

  it("updates an existing status issue", async () => {
    const existing: SearchIssue[] = [{ number: 42, body: "old" }];
    const { client, calls } = mockClient({
      searchIssues: () => Promise.resolve(existing),
    });
    const factory = () => client;

    await run(baseEnv(), quietDeps({ clientFactory: factory }));

    expect(calls.updateIssue).toHaveLength(1);
    expect(calls.createIssue).toHaveLength(0);
    const [, , issueNum] = calls.updateIssue[0] as [
      string,
      string,
      number,
      string,
      string,
    ];
    expect(issueNum).toBe(42);
  });

  it("skips API calls when GITHUB_REPOSITORY is not set", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;
    const env = baseEnv();
    delete env["GITHUB_REPOSITORY"];

    await run(env, quietDeps({ clientFactory: factory }));
    expect(calls.searchIssues).toHaveLength(0);
  });

  it("skips API calls when GITHUB_REPOSITORY is malformed", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(
      baseEnv({ GITHUB_REPOSITORY: "noslash" }),
      quietDeps({
        clientFactory: factory,
      }),
    );
    expect(calls.searchIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// run — PR flow
// ---------------------------------------------------------------------------

describe("run — PR flow", () => {
  let tmpDir: string;
  let eventPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "action-test-"));
    eventPath = join(tmpDir, "event.json");
    writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7 } }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function prEnv(extra: Env = {}): Env {
    return baseEnv({
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      ...extra,
    });
  }

  it("posts a PR comment", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(prEnv(), quietDeps({ clientFactory: factory }));

    expect(calls.postComment).toHaveLength(1);
    const [owner, repo, num, body] = calls.postComment[0] as [
      string,
      string,
      number,
      string,
    ];
    expect(owner).toBe("owner");
    expect(repo).toBe("repo");
    expect(num).toBe(7);
    expect(body).toContain("<!-- tf-report-action:");
    expect(body).toContain("[View logs]");
    expect(body).not.toContain("Last updated:");
  });

  it("deletes stale bot comments before posting", async () => {
    const marker = '<!-- tf-report-action:"CI/plan" -->';
    const staleComments: Comment[] = [
      { id: 100, body: `${marker}\nold report`, user: { type: "Bot" } },
      { id: 101, body: "unrelated comment", user: { type: "User" } },
      { id: 102, body: `${marker}\nanother old`, user: { type: "Bot" } },
    ];
    const { client, calls } = mockClient({
      getComments: () => Promise.resolve(staleComments),
    });
    const factory = () => client;

    await run(prEnv(), quietDeps({ clientFactory: factory }));

    expect(calls.deleteComment).toHaveLength(2);
    const deletedIds = calls.deleteComment.map((c) => c[2]);
    expect(deletedIds).toContain(100);
    expect(deletedIds).toContain(102);
    expect(calls.postComment).toHaveLength(1);
  });

  it("also triggers on pull_request_target", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(
      prEnv({ GITHUB_EVENT_NAME: "pull_request_target" }),
      quietDeps({
        clientFactory: factory,
      }),
    );

    expect(calls.postComment).toHaveLength(1);
    expect(calls.createIssue).toHaveLength(0);
  });

  it("reports error when event payload is unreadable", async () => {
    const { client } = mockClient();
    const factory = () => client;
    const { logger, messages } = capturingLogger();

    try {
      await run(prEnv({ GITHUB_EVENT_PATH: "/nonexistent" }), {
        clientFactory: factory,
        logger,
        exit: throwingExit,
      });
    } catch {
      // Expected — throwingExit throws
    }

    expect(messages.errors).toHaveLength(1);
    expect(messages.errors[0]).toContain("Could not read pull request number");
  });
});

// ---------------------------------------------------------------------------
// run — error handling
// ---------------------------------------------------------------------------

describe("run — error handling", () => {
  it("reports missing steps as error and exits", async () => {
    const { logger, messages } = capturingLogger();
    let exitCode: number | undefined;

    const env: Env = { "INPUT_GITHUB-TOKEN": "tok" };

    try {
      await run(env, {
        clientFactory: () => mockClient().client,
        logger,
        exit: ((code: number) => {
          exitCode = code;
          throw new ExitError(code);
        }) as (code: number) => never,
      });
    } catch {
      // Expected
    }

    expect(messages.errors).toHaveLength(1);
    expect(messages.errors[0]).toBeTruthy();
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Body budget
// ---------------------------------------------------------------------------

describe("body budget", () => {
  it("final body does not exceed 65536 characters", async () => {
    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });
    const factory = () => client;

    await run(baseEnv(), quietDeps({ clientFactory: factory }));

    expect(postedBody.length).toBeLessThanOrEqual(65_536);
  });
});

// ---------------------------------------------------------------------------
// run — artifact upload on truncation
// ---------------------------------------------------------------------------

describe("run — artifact upload on truncation", () => {
  it("does not call tryUploadFullReport when report is not truncated and flag is off", async () => {
    const { client } = mockClient();
    const uploadCalls: unknown[] = [];
    const fakeTryUpload = (
      params: import("../../../src/action/artifact-upload.js").TryUploadParams,
    ): Promise<string | undefined> => {
      uploadCalls.push(params);
      return Promise.resolve(undefined);
    };

    await run(
      baseEnv(),
      quietDeps({
        clientFactory: () => client,
        tryUploadFullReport: fakeTryUpload,
      }),
    );

    expect(uploadCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// run — always-upload-report
// ---------------------------------------------------------------------------

describe("run — always-upload-report", () => {
  it("calls tryUploadFullReport when always-upload-report is true", async () => {
    const uploadCalls: import("../../../src/action/artifact-upload.js").TryUploadParams[] =
      [];
    const { client } = mockClient();
    const fakeTryUpload = (
      params: import("../../../src/action/artifact-upload.js").TryUploadParams,
    ): Promise<string | undefined> => {
      uploadCalls.push(params);
      return Promise.resolve(
        "https://github.com/owner/repo/actions/runs/123/artifacts/42",
      );
    };

    await run(
      baseEnv({ "INPUT_ALWAYS-UPLOAD-REPORT": "true" }),
      quietDeps({
        clientFactory: () => client,
        tryUploadFullReport: fakeTryUpload,
      }),
    );

    expect(uploadCalls).toHaveLength(1);
  });

  it("appends artifact notice when upload succeeds and not truncated", async () => {
    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });
    const fakeTryUpload = (): Promise<string | undefined> =>
      Promise.resolve(
        "https://github.com/owner/repo/actions/runs/123/artifacts/42",
      );

    await run(
      baseEnv({ "INPUT_ALWAYS-UPLOAD-REPORT": "true" }),
      quietDeps({
        clientFactory: () => client,
        tryUploadFullReport: fakeTryUpload,
      }),
    );

    expect(postedBody).toContain("📎");
    expect(postedBody).toContain("View/Download Report");
    expect(postedBody).toContain(
      "https://github.com/owner/repo/actions/runs/123/artifacts/42",
    );
    // Should NOT contain truncation warning since report fits
    expect(postedBody).not.toContain("Output truncated");
  });

  it("does not append artifact notice when upload fails", async () => {
    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });
    const fakeTryUpload = (): Promise<string | undefined> =>
      Promise.resolve(undefined);

    await run(
      baseEnv({ "INPUT_ALWAYS-UPLOAD-REPORT": "true" }),
      quietDeps({
        clientFactory: () => client,
        tryUploadFullReport: fakeTryUpload,
      }),
    );

    expect(postedBody).not.toContain("📎");
    expect(postedBody).not.toContain("View/Download Report");
  });
});

// ---------------------------------------------------------------------------
// run — artifact name construction
// ---------------------------------------------------------------------------

describe("run — artifact naming", () => {
  // These tests cannot easily force truncation through the public API since
  // COMMENT_LIMIT is a constant. The artifact naming logic is in the truncation
  // branch which only runs when wasTruncated is true. We verify the naming
  // convention indirectly — the buildLogsNotice tests below exercise the
  // non-truncation path, and the artifact-upload.test.ts tests verify the
  // upload orchestrator in isolation.
  //
  // The important contract: artifact name = `${workspace}-${operation}` when
  // workspace is set, or just `${operation}` otherwise, with "report" as
  // fallback for undefined operation.
  it("workspace is included in the dedup marker", async () => {
    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });

    await run(
      baseEnv({ INPUT_WORKSPACE: "staging" }),
      quietDeps({
        clientFactory: () => client,
      }),
    );

    expect(postedBody).toContain('<!-- tf-report-action:"staging" -->');
  });
});

// ---------------------------------------------------------------------------
// run — logs notice for unresolved failures
// ---------------------------------------------------------------------------

describe("run — logs notice", () => {
  it("does not append logs notice when hasUnresolvedFailures is false", async () => {
    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });

    // Simple steps context with a successful step — no unresolved failures
    await run(baseEnv(), quietDeps({ clientFactory: () => client }));

    // The info icon from buildLogsNotice should NOT be present
    expect(postedBody).not.toContain("ℹ️");
    expect(postedBody).not.toContain("Some step errors are not shown");
  });

  it("appends logs notice when a step fails without captured output", async () => {
    // Construct a steps context with a failed step that has no output files
    // (stdout_file and stderr_file not present → stdout/stderr undefined)
    const stepsWithFailure = JSON.stringify({
      init: { outcome: "success", conclusion: "success", outputs: {} },
      plan: {
        outcome: "failure",
        conclusion: "failure",
        outputs: {},
      },
    });

    let postedBody = "";
    const { client } = mockClient({
      createIssue: (_o, _r, _t, body) => {
        postedBody = body;
        return Promise.resolve(1);
      },
    });

    await run(
      baseEnv({ INPUT_STEPS: stepsWithFailure }),
      quietDeps({
        clientFactory: () => client,
      }),
    );

    // The logs notice should be present with the info icon
    expect(postedBody).toContain("ℹ️");
    expect(postedBody).toContain("workflow run logs");
    expect(postedBody).toContain(
      "https://github.com/owner/repo/actions/runs/123/attempts/1",
    );
  });
});
