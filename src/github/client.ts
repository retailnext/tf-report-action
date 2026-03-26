import type { HttpResponse } from "../http/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * HTTP transport function — injectable for testing.
 *
 * Accepts a method, fully-qualified URL, headers, and optional body string.
 * Returns the raw HTTP response. The concrete implementation (backed by
 * `src/http/transport.ts`) is wired in the composition root (`action/main.ts`).
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

/** Dependencies for creating a GitHub client. */
export interface GitHubClientDeps {
  /** GitHub personal access token, `GITHUB_TOKEN`, or GitHub App JWT. */
  readonly token: string;
  /**
   * Base URL for the GitHub REST API.
   * Defaults to `https://api.github.com`. Set for GHES instances.
   */
  readonly baseUrl?: string;
  /**
   * HTTP transport function. Inject a mock for unit testing.
   * The real transport is wired in the composition root.
   */
  readonly transport: HttpTransport;
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
  /**
   * Render Markdown to HTML using GitHub's rendering API.
   *
   * Returns raw HTML — the response is `text/html`, not JSON.
   */
  renderMarkdown(params: {
    text: string;
    mode: "gfm";
    context: string;
  }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.github.com";

/**
 * Determine the auth scheme from the token format.
 *
 * GitHub App JWTs have exactly two dots (three base64 segments).
 * PATs and GITHUB_TOKEN use the `token` scheme.
 */
function authScheme(token: string): "bearer" | "token" {
  return token.split(".").length === 3 ? "bearer" : "token";
}

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `${authScheme(token)} ${token}`,
    "User-Agent": "tf-report-action",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
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
  if (res.status < 200 || res.status > 299) {
    const preview =
      res.body.length > 200 ? res.body.slice(0, 200) + "\u2026" : res.body;
    throw new Error(
      `GitHub API request failed with status ${String(res.status)}: ${preview}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a {@link GitHubClient} backed by the GitHub REST API.
 *
 * The `transport` function is the HTTP layer — inject a mock for unit testing,
 * or wire the real `httpRequest` from `src/http/` in the composition root.
 */
export function createGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const { token, transport } = deps;
  const apiBase = deps.baseUrl ?? DEFAULT_BASE_URL;

  async function getComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<Comment[]> {
    const all: Comment[] = [];
    let page = 1;
    for (;;) {
      const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments?per_page=100&page=${String(page)}`;
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
    const url = `${apiBase}/repos/${owner}/${repo}/issues/comments/${String(commentId)}`;
    const res = await transport("DELETE", url, baseHeaders(token));
    assertOk(res);
  }

  async function postComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}/comments`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify({ body }),
    );
    assertOk(res);
  }

  async function searchIssues(query: string): Promise<SearchIssue[]> {
    const url = `${apiBase}/search/issues?q=${encodeURIComponent(query)}`;
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
    const url = `${apiBase}/repos/${owner}/${repo}/issues`;
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
    const url = `${apiBase}/repos/${owner}/${repo}/issues/${String(issueNumber)}`;
    const res = await transport(
      "PATCH",
      url,
      withJsonBody(token),
      JSON.stringify({ title, body }),
    );
    assertOk(res);
  }

  async function renderMarkdown(params: {
    text: string;
    mode: "gfm";
    context: string;
  }): Promise<string> {
    const url = `${apiBase}/markdown`;
    const res = await transport(
      "POST",
      url,
      withJsonBody(token),
      JSON.stringify(params),
    );
    assertOk(res);
    // The /markdown endpoint returns raw HTML (text/html), not JSON.
    return res.body;
  }

  return {
    getComments,
    deleteComment,
    postComment,
    searchIssues,
    createIssue,
    updateIssue,
    renderMarkdown,
  };
}
