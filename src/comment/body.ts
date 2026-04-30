/**
 * Comment body assembly.
 *
 * Given report markdown and optional notices, assembles the final comment
 * body. The two-pass truncation logic lives in the caller (action/main.ts)
 * because it interleaves artifact upload between passes. This module
 * provides the pure assembly functions the caller needs.
 */

import {
  buildTruncationNotice,
  buildLogsNotice,
  buildArtifactNotice,
} from "./notices.js";
import type { NoticeLink } from "./notices.js";

/**
 * Build the truncation notice for a truncated report.
 *
 * @param artifactUrl - Artifact URL if upload succeeded, or undefined
 * @param logsUrl - Fallback URL to the workflow run logs
 * @returns The truncation notice string and its length (for budget reservation)
 */
export function buildTruncation(
  artifactUrl: string | undefined,
  logsUrl: string,
): string {
  const link: NoticeLink = artifactUrl
    ? { url: artifactUrl, label: "View full report" }
    : { url: logsUrl, label: "View full workflow run logs" };
  return buildTruncationNotice(link);
}

/**
 * Assemble the final comment body from report markdown, notices, and footer.
 *
 * @param markdown - The report markdown (already budget-constrained)
 * @param footer - The comment footer
 * @param options - Optional notices to append
 */
export function assembleCommentBody(
  markdown: string,
  footer: string,
  options?: {
    truncationNotice?: string | undefined;
    artifactUrl?: string | undefined;
    logsUrl?: string | undefined;
    hasUnresolvedFailures?: boolean | undefined;
  },
): string {
  let body = markdown;

  if (options?.truncationNotice !== undefined) {
    body += options.truncationNotice;
  } else if (options?.artifactUrl !== undefined) {
    body += buildArtifactNotice({
      url: options.artifactUrl,
      label: "View/Download Report",
    });
  }

  if (
    options?.hasUnresolvedFailures === true &&
    options.logsUrl !== undefined
  ) {
    body += buildLogsNotice({
      url: options.logsUrl,
      label: "workflow run logs",
    });
  }

  body += footer;
  return body;
}
