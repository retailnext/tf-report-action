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

import type { Env } from "../env/index.js";
import type { ReportOptions } from "../pipelines/steps.js";
import { reportFromSteps } from "../pipelines/steps.js";
import type { GitHubClient, GitHubClientDeps } from "../github/index.js";
import { createGitHubClient } from "../github/index.js";
import { httpRequest } from "../http/index.js";
import type { Logger } from "../logger/index.js";
import { actionsLogger } from "../logger/index.js";
import { parseInputs, readPrNumber } from "../inputs/index.js";
import {
  buildLogsUrl,
  parseRepo,
  buildFooter,
  calculateBudget,
  buildMarker,
  assembleCommentBody,
  buildTruncation,
} from "../comment/index.js";
import { tryUploadFullReport } from "./artifact-upload.js";
import type { TryUploadParams } from "./artifact-upload.js";

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
 */
export async function run(
  env: Env = process.env,
  deps?: RunDeps,
): Promise<void> {
  const logger = deps?.logger ?? actionsLogger();
  const exit = deps?.exit ?? ((code: number): never => process.exit(code));
  try {
    const clientFactory = deps?.clientFactory ?? createGitHubClient;
    const tryUpload = deps?.tryUploadFullReport ?? tryUploadFullReport;
    const inputs = parseInputs(env);

    const eventName = env["GITHUB_EVENT_NAME"] ?? "";
    const isPr =
      eventName === "pull_request" || eventName === "pull_request_target";

    const logsUrl = buildLogsUrl(env);
    const footer = buildFooter(logsUrl, isPr);

    const reportOptions: ReportOptions = {
      workspace: inputs.workspace,
      env,
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

    // Build the report once — render at different budgets/formats as needed
    const fullBudget = calculateBudget(footer.length);
    const result = reportFromSteps(inputs.steps, reportOptions);
    const { operation, hasUnresolvedFailures } = result;

    // First render: full budget (no truncation notice reservation)
    const mdResult = result.report.render("markdown", fullBudget);
    let markdown = mdResult.output;
    const wasTruncated = mdResult.truncated;

    // Upload artifact when truncated or always-upload-report enabled
    const shouldUpload = wasTruncated || inputs.alwaysUploadReport;
    let artifactUrl: string | undefined;

    if (shouldUpload) {
      const workspacePart = inputs.workspace
        ? `${sanitizeArtifactSegment(inputs.workspace)}-`
        : "";
      const opPart = operation !== undefined ? `${operation}-` : "";
      const artifactName = `${workspacePart}${opPart}report.html`;

      // Render full-detail HTML natively — no GitHub /markdown API call
      const htmlResult = result.report.render("html");
      artifactUrl = await tryUpload({
        htmlContent: htmlResult.output,
        env,
        artifactName,
        logger,
        deps: { transport },
      });
    }

    if (wasTruncated) {
      const truncationNotice = buildTruncation(artifactUrl, logsUrl);

      // Re-render at reduced budget to make room for truncation notice
      const reducedBudget = Math.max(0, fullBudget - truncationNotice.length);
      markdown =
        result.report.render("markdown", reducedBudget).output +
        truncationNotice;
    }

    const body = assembleCommentBody(markdown, footer, {
      artifactUrl: wasTruncated ? undefined : artifactUrl,
      logsUrl,
      hasUnresolvedFailures,
    });

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
// Artifact name helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a workspace name for use as a segment in an artifact filename.
 *
 * GitHub artifact names must not contain characters that are illegal in URLs
 * or on common filesystems (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`).
 * The auto-derived workspace (`GITHUB_WORKFLOW/GITHUB_JOB`) contains `/`,
 * and user-provided workspace values may contain other special characters.
 *
 * Replaces every character outside `[A-Za-z0-9._-]` with `-`, collapses
 * consecutive hyphens to a single one, and trims leading/trailing hyphens.
 */
export function sanitizeArtifactSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
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
