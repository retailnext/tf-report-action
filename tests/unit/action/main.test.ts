import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { run, formatTimestamp } from "../../../src/action/main.js";
import type { Env } from "../../../src/env/index.js";
import type {
  GitHubClient,
  Comment,
  SearchIssue,
} from "../../../src/github/index.js";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

    await run(baseEnv(), factory);

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

    await run(baseEnv(), factory);

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

    await run(env, factory);
    expect(calls.searchIssues).toHaveLength(0);
  });

  it("skips API calls when GITHUB_REPOSITORY is malformed", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(baseEnv({ GITHUB_REPOSITORY: "noslash" }), factory);
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

    await run(prEnv(), factory);

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

    await run(prEnv(), factory);

    expect(calls.deleteComment).toHaveLength(2);
    const deletedIds = calls.deleteComment.map((c) => c[2]);
    expect(deletedIds).toContain(100);
    expect(deletedIds).toContain(102);
    expect(calls.postComment).toHaveLength(1);
  });

  it("also triggers on pull_request_target", async () => {
    const { client, calls } = mockClient();
    const factory = () => client;

    await run(prEnv({ GITHUB_EVENT_NAME: "pull_request_target" }), factory);

    expect(calls.postComment).toHaveLength(1);
    expect(calls.createIssue).toHaveLength(0);
  });

  it("reports error when event payload is unreadable", async () => {
    const { client } = mockClient();
    const factory = () => client;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation((() => {
      return undefined; // suppress test output
    }) as never);

    try {
      await run(prEnv({ GITHUB_EVENT_PATH: "/nonexistent" }), factory);
    } catch {
      // Expected — exit mock throws
    }

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("::error::Could not read pull request number"),
    );
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// run — error handling
// ---------------------------------------------------------------------------

describe("run — error handling", () => {
  it("reports missing steps as ::error:: and exits", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("EXIT");
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation((() => {
      return undefined; // suppress test output
    }) as never);

    const env: Env = { "INPUT_GITHUB-TOKEN": "tok" };

    try {
      await run(env, () => mockClient().client);
    } catch {
      // Expected
    }

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("::error::"));
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
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

    await run(baseEnv(), factory);

    expect(postedBody.length).toBeLessThanOrEqual(65_536);
  });
});
