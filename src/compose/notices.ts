/**
 * Post-composition notice builders.
 *
 * Produces the truncation warning, logs link, and artifact link appended
 * after a composed report. These are composition concerns — they depend
 * on whether the output was truncated and whether an artifact was uploaded.
 *
 * Moved from compositor/truncation.ts to compose/ because the composition
 * pipeline (not the action entry point) should own notice lifecycle.
 */

import {
  DIAGNOSTIC_WARNING,
  INFO_ICON,
  ARTIFACT_ICON,
} from "../model/status-icons.js";

/** Link target for notices (truncation, logs, artifact). */
export interface NoticeLink {
  readonly url: string;
  readonly label: string;
}

/**
 * Build the truncation notice string.
 *
 * When `link` is provided, the notice includes a clickable link with the
 * given label and URL. When absent, a generic message directs the reader
 * to the workflow run logs.
 */
export function buildTruncationNotice(link?: NoticeLink): string {
  if (link !== undefined) {
    return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit.\n> [${link.label}](${link.url})\n`;
  }
  return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit. Check the workflow run logs for complete output.\n`;
}

/**
 * Build a notice directing users to workflow run logs for error details.
 *
 * Used when a step failed but its stdout/stderr output was not captured
 * in the report. The logs are the only place to find the actual error.
 */
export function buildLogsNotice(link: NoticeLink): string {
  return `\n---\n\n> ${INFO_ICON} Some step errors are not shown — see the [${link.label}](${link.url}) for details.\n`;
}

/**
 * Build a subtle artifact link for non-truncated reports.
 *
 * Used when `always-upload-report` is enabled and the report was not
 * truncated. The link is a compact line (not a warning blockquote)
 * directing readers to the full HTML artifact.
 */
export function buildArtifactNotice(link: NoticeLink): string {
  return `\n${ARTIFACT_ICON} [${link.label}](${link.url})\n`;
}
