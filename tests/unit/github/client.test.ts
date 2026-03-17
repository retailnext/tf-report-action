import { describe, it, expect } from "vitest";
import { createGitHubClient } from "../../../src/github/client.js";
import type {
  HttpResponse,
  HttpTransport,
} from "../../../src/github/client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TransportCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function mockTransport(responses: HttpResponse[]): {
  transport: HttpTransport;
  calls: TransportCall[];
} {
  const calls: TransportCall[] = [];
  let index = 0;
  // eslint-disable-next-line @typescript-eslint/require-await
  const transport: HttpTransport = async (method, url, headers, body) => {
    calls.push({ method, url, headers, body });
    const res = responses[index++];
    if (!res) throw new Error("Mock transport: no more responses configured");
    return res;
  };
  return { transport, calls };
}

function ok(
  body: string,
  headers: Record<string, string | string[] | undefined> = {},
): HttpResponse {
  return { statusCode: 200, headers, body };
}

function created(body: string): HttpResponse {
  return { statusCode: 201, headers: {}, body };
}

function noContent(): HttpResponse {
  return { statusCode: 204, headers: {}, body: "" };
}

function err(status: number, body = "error"): HttpResponse {
  return { statusCode: status, headers: {}, body };
}

const TOKEN = "ghp_test123";

// ---------------------------------------------------------------------------
// getComments
// ---------------------------------------------------------------------------

describe("getComments", () => {
  it("paginates until an empty page", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      body: `c${String(i + 1)}`,
      user: { type: "User" },
    }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      id: 101 + i,
      body: `c${String(101 + i)}`,
      user: { type: "User" },
    }));

    const { transport, calls } = mockTransport([
      ok(JSON.stringify(page1)),
      ok(JSON.stringify(page2)),
      ok(JSON.stringify([])),
    ]);

    const client = createGitHubClient(TOKEN, transport);
    const comments = await client.getComments("owner", "repo", 42);

    expect(comments).toHaveLength(150);
    expect(calls).toHaveLength(3);
    expect(calls[0]!.url).toContain("page=1");
    expect(calls[1]!.url).toContain("page=2");
    expect(calls[2]!.url).toContain("page=3");
  });

  it("sends correct authorization and accept headers", async () => {
    const { transport, calls } = mockTransport([ok(JSON.stringify([]))]);
    const client = createGitHubClient(TOKEN, transport);
    await client.getComments("o", "r", 1);

    const h = calls[0]!.headers;
    expect(h["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(h["User-Agent"]).toBe("tf-report-action");
    expect(h["Accept"]).toBe("application/vnd.github+json");
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(403, "Forbidden")]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.getComments("o", "r", 1)).rejects.toThrow(/403/);
  });
});

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

describe("deleteComment", () => {
  it("sends DELETE to the correct URL", async () => {
    const { transport, calls } = mockTransport([noContent()]);
    const client = createGitHubClient(TOKEN, transport);
    await client.deleteComment("owner", "repo", 999);

    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/owner/repo/issues/comments/999",
    );
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(404)]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.deleteComment("o", "r", 1)).rejects.toThrow(/404/);
  });
});

// ---------------------------------------------------------------------------
// postComment
// ---------------------------------------------------------------------------

describe("postComment", () => {
  it("sends POST with JSON body and correct content-type", async () => {
    const { transport, calls } = mockTransport([created("{}")]);
    const client = createGitHubClient(TOKEN, transport);
    await client.postComment("owner", "repo", 7, "hello world");

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/owner/repo/issues/7/comments",
    );
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ body: "hello world" });
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(500)]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.postComment("o", "r", 1, "x")).rejects.toThrow(/500/);
  });
});

// ---------------------------------------------------------------------------
// searchIssues
// ---------------------------------------------------------------------------

describe("searchIssues", () => {
  it("sends GET with URL-encoded query and returns items", async () => {
    const items = [
      { number: 1, body: "issue one" },
      { number: 2, body: "issue two" },
    ];
    const { transport, calls } = mockTransport([ok(JSON.stringify({ items }))]);
    const client = createGitHubClient(TOKEN, transport);
    const result = await client.searchIssues("repo:o/r is:open label:bug");

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toContain(
      encodeURIComponent("repo:o/r is:open label:bug"),
    );
    expect(result).toEqual(items);
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(422)]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.searchIssues("bad")).rejects.toThrow(/422/);
  });
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

describe("createIssue", () => {
  it("sends POST and returns the issue number", async () => {
    const { transport, calls } = mockTransport([
      created(JSON.stringify({ number: 42 })),
    ]);
    const client = createGitHubClient(TOKEN, transport);
    const num = await client.createIssue("owner", "repo", "title", "body");

    expect(num).toBe(42);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/owner/repo/issues",
    );
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      title: "title",
      body: "body",
    });
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(403)]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.createIssue("o", "r", "t", "b")).rejects.toThrow(/403/);
  });
});

// ---------------------------------------------------------------------------
// updateIssue
// ---------------------------------------------------------------------------

describe("updateIssue", () => {
  it("sends PATCH with correct body", async () => {
    const { transport, calls } = mockTransport([ok("{}")]);
    const client = createGitHubClient(TOKEN, transport);
    await client.updateIssue("owner", "repo", 10, "new title", "new body");

    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe(
      "https://api.github.com/repos/owner/repo/issues/10",
    );
    expect(JSON.parse(calls[0]!.body!)).toEqual({
      title: "new title",
      body: "new body",
    });
  });

  it("throws on non-2xx response", async () => {
    const { transport } = mockTransport([err(404)]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.updateIssue("o", "r", 1, "t", "b")).rejects.toThrow(
      /404/,
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling edge cases
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("throws on invalid JSON in response body", async () => {
    const { transport } = mockTransport([ok("not json")]);
    const client = createGitHubClient(TOKEN, transport);
    await expect(client.searchIssues("q")).rejects.toThrow(/invalid JSON/i);
  });
});
