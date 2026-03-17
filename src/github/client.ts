import * as https from "node:https";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw HTTP response from the transport layer. */
export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * HTTP transport function — injectable for testing.
 *
 * Accepts a method, fully-qualified URL, headers, and optional body string.
 * Returns the raw HTTP response.
 */
export type HttpTransport = (
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
) => Promise<HttpResponse>;

/** A GitHub issue comment. */
export interface Comment {
  id: number;
  body: string;
  user: { type: string } | null;
}

/** A GitHub issue from search results. */
export interface SearchIssue {
  number: number;
  body: string;
}

/** GitHub API client interface for DI. */
export interface GitHubClient {
  /** List all comments on an issue or pull request, paginating automatically. */
  getComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Comment[]>;
  /** Delete a single issue comment by ID. */
  deleteComment(owner: string, repo: string, commentId: number): Promise<void>;
  /** Post a new comment on an issue or pull request. */
  postComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void>;
  /** Search issues via the GitHub search API. */
  searchIssues(query: string): Promise<SearchIssue[]>;
  /** Create a new issue and return the issue number. */
  createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
  ): Promise<number>;
  /** Update an existing issue's title and body. */
  updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    title: string,
    body: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default HTTPS transport
// ---------------------------------------------------------------------------

/**
 * Default HTTP transport backed by Node.js `https.request`.
 *
 * Sends the request to the given URL and collects the full response body as a
 * string. Network-level errors are propagated as-is.
 */
function defaultTransport(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const API_BASE = "https://api.github.com";

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "tf-report-action",
    Accept: "application/vnd.github+json",
  };
}

function withJsonBody(token: string): Record<string, string> {
  return {
    ...baseHeaders(token),
    "Content-Type": "application/json",
  };
}

/**
 * Parse a JSON response body, wrapping parse failures with a descriptive
 * message that does not leak raw body content (which could include sensitive
 * plan data in issue bodies).
 */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("GitHub API returned invalid JSON");
  }
}

/** Throw if the HTTP status code is outside the 2xx range. */
function assertOk(res: HttpResponse): void {
  if (res.statusCode < 200 || res.statusCode > 299) {
    // Truncate body to avoid leaking sensitive data (e.g. issue bodies
    // containing plan content) in error messages.
    const preview =
      res.body.length > 200 ? res.body.slice(0, 200) + "…" : res.body;
    throw new Error(
      `GitHub API request failed with status ${String(res.statusCode)}: ${preview}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a {@link GitHubClient} backed by the GitHub REST API.
 *
 * @param token - GitHub personal access token or `GITHUB_TOKEN`.
 * @param transport - Optional HTTP transport override (defaults to Node.js
 *   `https.request`). Inject a mock here for unit testing.
 */
export function createGitHubClient(
  token: string,
  transport: HttpTransport = defaultTransport,
): GitHubClient {
  async function getComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Comment[]> {
    const all: Comment[] = [];
    let page = 1;
    for (;;) {
      const url = `${API_BASE}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments?per_page=100&page=${String(page)}`;
      const res = await transport("GET", url, baseHeaders(token));
      assertOk(res);
      const batch = parseJson(res.body) as Comment[];
      if (batch.length === 0) break;
      all.push(...batch);
      page++;
    }
    return all;
  }

  async function deleteComment(
    owner: string,
    repo: string,
    commentId: number,
  ): Promise<void> {
    const url = `${API_BASE}/repos/${owner}/${repo}/issues/comments/${String(commentId)}`;
    const res = await transport("DELETE", url, baseHeaders(token));
    assertOk(res);
  }

  async function postComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    const url = `${API_BASE}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify({ body }),
    );
    assertOk(res);
  }

  async function searchIssues(query: string): Promise<SearchIssue[]> {
    const url = `${API_BASE}/search/issues?q=${encodeURIComponent(query)}`;
    const res = await transport("GET", url, baseHeaders(token));
    assertOk(res);
    const data = parseJson(res.body) as { items: SearchIssue[] };
    return data.items;
  }

  async function createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string,
  ): Promise<number> {
    const url = `${API_BASE}/repos/${owner}/${repo}/issues`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify({ title, body }),
    );
    assertOk(res);
    const data = parseJson(res.body) as { number: number };
    return data.number;
  }

  async function updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    title: string,
    body: string,
  ): Promise<void> {
    const url = `${API_BASE}/repos/${owner}/${repo}/issues/${String(issueNumber)}`;
    const res = await transport(
      "PATCH",
      url,
      withJsonBody(token),
      JSON.stringify({ title, body }),
    );
    assertOk(res);
  }

  return {
    getComments,
    deleteComment,
    postComment,
    searchIssues,
    createIssue,
    updateIssue,
  };
}
