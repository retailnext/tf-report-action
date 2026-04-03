/**
 * GitHub Action entry point — orchestrates report generation and posting.
 *
 * Reads inputs from the environment, generates a markdown report via
 * `reportFromSteps`, and posts it as a PR comment or status issue via
 * the GitHub API.
 *
 * The `run` function **never throws** — all errors are converted to
 * `::error::` annotations and a non-zero exit code.
 */

import { readFileSync } from "node:fs";
import type { Env } from "../env/index.js";
import type { ReportOptions } from "../index.js";
import {
  reportFromSteps,
  buildTruncationNotice,
  buildLogsNotice,
  buildArtifactNotice,
} from "../index.js";
import type { GitHubClient, GitHubClientDeps } from "../github/index.js";
import { createGitHubClient } from "../github/index.js";
import { httpRequest } from "../http/index.js";
import { parseInputs } from "./inputs.js";
import { tryUploadFullReport } from "./artifact-upload.js";
import type { TryUploadParams } from "./artifact-upload.js";
import type { Logger } from "./logger.js";
import { actionsLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** GitHub comment body hard limit (characters). */
const COMMENT_LIMIT = 65_536;

/** Reserved bytes for internal overhead (metadata, fencing, etc.). */
const OVERHEAD_RESERVE = 512;

/** Month names for UTC timestamp formatting. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as `MONTH DAY, YEAR at HH:MM UTC`.
 *
 * Always uses UTC components so output is deterministic regardless of
 * the runner's local timezone.
 */
export function formatTimestamp(date: Date): string {
  const month = MONTHS[date.getUTCMonth()] ?? "January";
  const day = String(date.getUTCDate());
  const year = String(date.getUTCFullYear());
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
}

/**
 * Escape special characters in a workspace name for safe HTML comment
 * embedding.  Must match the logic in `src/renderer/title.ts`.
 */
function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/(--!?)>/g, "$1\\>");
}

/** Build the workspace dedup marker HTML comment. */
function buildMarker(workspace: string): string {
  return `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->`;
}

/** Build the logs URL from environment variables. */
function buildLogsUrl(env: Env): string {
  const repo = env["GITHUB_REPOSITORY"] ?? "";
  const runId = env["GITHUB_RUN_ID"] ?? "";
  const attempt = env["GITHUB_RUN_ATTEMPT"] ?? "1";
  return `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
}

/**
 * Parse `owner/repo` from `GITHUB_REPOSITORY`.
 *
 * Returns `undefined` if the variable is missing or not in `owner/repo`
 * format.
 */
function parseRepo(env: Env): { owner: string; repo: string } | undefined {
  const full = env["GITHUB_REPOSITORY"];
  if (full === undefined || full === "") return undefined;
  const slash = full.indexOf("/");
  if (slash <= 0 || slash === full.length - 1) return undefined;
  return { owner: full.slice(0, slash), repo: full.slice(slash + 1) };
}

/**
 * Read the pull request number from the event payload file.
 *
 * Returns `undefined` if the file cannot be read or the payload does
 * not contain a `pull_request.number` field.
 */
function readPrNumber(eventPath: string): number | undefined {
  try {
    const raw = readFileSync(eventPath, "utf-8");
    const event = JSON.parse(raw) as {
      pull_request?: { number?: number };
    };
    const num = event.pull_request?.number;
    return typeof num === "number" ? num : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// PR flow
// ---------------------------------------------------------------------------

/** Delete stale bot comments and post a fresh one. */
async function handlePr(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  marker: string,
  body: string,
): Promise<void> {
  const comments = await client.getComments(owner, repo, prNumber);

  // Delete previous bot comments that carry the same workspace marker
  const stale = comments.filter(
    (c) => c.body.startsWith(marker) && c.user?.type === "Bot",
  );
  for (const c of stale) {
    await client.deleteComment(owner, repo, c.id);
  }

  await client.postComment(owner, repo, prNumber, body);
}

// ---------------------------------------------------------------------------
// Issue (non-PR) flow
// ---------------------------------------------------------------------------

/** Create or update a status issue carrying the workspace marker. */
async function handleIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  workspace: string,
  marker: string,
  body: string,
): Promise<void> {
  const query = `repo:${owner}/${repo} is:issue in:body "${marker}"`;
  const issues = await client.searchIssues(query);
  const title = `:bar_chart: \`${workspace}\` Status`;

  if (issues.length > 0) {
    // Update the first matching issue (should only be one)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await client.updateIssue(owner, repo, issues[0]!.number, title, body);
  } else {
    await client.createIssue(owner, repo, title, body);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for the `run` function.
 *
 * All fields are optional and default to their real implementations.
 * Tests inject fakes for the GitHub client, artifact upload, and logger.
 */
export interface RunDeps {
  /** Factory for creating a GitHub API client. */
  readonly clientFactory?: (deps: GitHubClientDeps) => GitHubClient;
  /** Artifact upload function — injected for testability. */
  readonly tryUploadFullReport?: (
    params: TryUploadParams,
  ) => Promise<string | undefined>;
  /** Logger for workflow annotations — defaults to `actionsLogger()`. */
  readonly logger?: Logger;
  /** Process exit function — defaults to `process.exit`. */
  readonly exit?: (code: number) => never;
}

/**
 * Run the GitHub Action.
 *
 * Generates a report from the steps context and posts it as a PR
 * comment or status issue.  **Never throws** — all errors are reported
 * via `logger.error()` and `exit(1)`.
 *
 * @param env - Environment variables (defaults to `process.env`)
 * @param deps - Injectable dependencies (defaults to real implementations)
 */
export async function run(
  env: Env = process.env as Env,
  deps?: RunDeps,
): Promise<void> {
  const logger = deps?.logger ?? actionsLogger();
  const exit = deps?.exit ?? ((code: number): never => process.exit(code));
  try {
    const clientFactory = deps?.clientFactory ?? createGitHubClient;
    const tryUpload = deps?.tryUploadFullReport ?? tryUploadFullReport;
    const inputs = parseInputs(env);

    // -----------------------------------------------------------------------
    // Detect PR context
    // -----------------------------------------------------------------------
    const eventName = env["GITHUB_EVENT_NAME"] ?? "";
    const isPr =
      eventName === "pull_request" || eventName === "pull_request_target";

    // -----------------------------------------------------------------------
    // Build footer and compute output budget
    // -----------------------------------------------------------------------
    const logsUrl = buildLogsUrl(env);
    const footer = isPr
      ? `\n---\n\n[View logs](${logsUrl})\n`
      : `\n---\n\n[View logs](${logsUrl}) • Last updated: ${formatTimestamp(new Date())}\n`;

    const reportOptions: ReportOptions = {
      workspace: inputs.workspace,
      env,
      maxOutputLength: 0, // overridden below
      initStepId: inputs.initStepId,
      validateStepId: inputs.validateStepId,
      planStepId: inputs.planStepId,
      showPlanStepId: inputs.showPlanStepId,
      applyStepId: inputs.applyStepId,
      stateStepId: inputs.stateStepId,
    };

    if (env["RUNNER_TEMP"] !== undefined && env["RUNNER_TEMP"] !== "") {
      reportOptions.allowedDirs = [env["RUNNER_TEMP"]];
    }

    // -----------------------------------------------------------------------
    // GitHub API setup (needed for both artifact upload and comment posting)
    // -----------------------------------------------------------------------
    const repoInfo = parseRepo(env);
    if (repoInfo === undefined) {
      logger.info("GITHUB_REPOSITORY not set, skipping API calls");
      return;
    }
    const { owner, repo } = repoInfo;

    const marker = buildMarker(inputs.workspace);
    const transport = (
      method: string,
      url: string,
      headers: Record<string, string>,
      reqBody?: string,
    ) => httpRequest(method, url, headers, reqBody, { env });
    const client = clientFactory({
      token: inputs.githubToken,
      ...(env["GITHUB_API_URL"] !== undefined &&
        env["GITHUB_API_URL"] !== "" && { baseUrl: env["GITHUB_API_URL"] }),
      transport,
    });

    // -----------------------------------------------------------------------
    // Generate report and handle truncation / artifact upload
    // -----------------------------------------------------------------------

    // First pass: give the report the full available budget (no truncation
    // notice reservation). If the report is not truncated, we avoid
    // needlessly shrinking the budget.
    const fullBudget = Math.max(
      0,
      COMMENT_LIMIT - footer.length - OVERHEAD_RESERVE,
    );

    const result = reportFromSteps(inputs.steps, {
      ...reportOptions,
      maxOutputLength: fullBudget,
    });

    let { markdown } = result;
    const { fullMarkdown, wasTruncated, operation, hasUnresolvedFailures } =
      result;

    // Upload artifact when truncated OR when always-upload-report is enabled.
    const shouldUpload = wasTruncated || inputs.alwaysUploadReport;
    let artifactUrl: string | undefined;

    if (shouldUpload) {
      const opLabel = operation ?? "report";
      const artifactName = inputs.workspace
        ? `${inputs.workspace}-${opLabel}`
        : opLabel;

      artifactUrl = await tryUpload({
        fullMarkdown,
        renderMarkdown: client.renderMarkdown.bind(client),
        env,
        repoContext: `${owner}/${repo}`,
        artifactName,
        logger,
        deps: { transport },
      });
    }

    if (wasTruncated) {
      const link = artifactUrl
        ? { url: artifactUrl, label: "View full report" }
        : { url: logsUrl, label: "View full workflow run logs" };
      const truncationNotice = buildTruncationNotice(link);

      // Second pass: re-generate with truncation notice length reserved so
      // the final output (report + notice + footer) fits.
      const reducedBudget = Math.max(0, fullBudget - truncationNotice.length);
      ({ markdown } = reportFromSteps(inputs.steps, {
        ...reportOptions,
        maxOutputLength: reducedBudget,
      }));

      markdown += truncationNotice;
    } else if (artifactUrl !== undefined) {
      // Not truncated but always-upload-report is enabled — add a subtle link
      markdown += buildArtifactNotice({
        url: artifactUrl,
        label: "View/Download Report",
      });
    }

    // When step failures lack captured output, always link to logs
    // (even if not truncated — the error details are only in the logs).
    if (hasUnresolvedFailures) {
      markdown += buildLogsNotice({ url: logsUrl, label: "workflow run logs" });
    }

    // -----------------------------------------------------------------------
    // Construct full comment body
    // -----------------------------------------------------------------------
    const body = markdown + footer;

    // -----------------------------------------------------------------------
    // Post via GitHub API
    // -----------------------------------------------------------------------
    if (isPr) {
      const eventPath = env["GITHUB_EVENT_PATH"] ?? "";
      const prNumber = readPrNumber(eventPath);
      if (prNumber === undefined) {
        throw new Error(
          "Could not read pull request number from event payload",
        );
      }
      await handlePr(client, owner, repo, prNumber, marker, body);
    } else {
      await handleIssue(client, owner, repo, inputs.workspace, marker, body);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main module guard
// ---------------------------------------------------------------------------

if (
  import.meta.url === `file://${process.argv[1] ?? ""}` ||
  import.meta.url.endsWith(process.argv[1] ?? "")
) {
  void run();
}
