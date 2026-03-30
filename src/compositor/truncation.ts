/**
 * Truncation notice builder — produces the truncation warning appended
 * when the compositor had to degrade or omit sections.
 */

import { DIAGNOSTIC_WARNING, INFO_ICON } from "../model/status-icons.js";

/** Link target for the truncation notice. */
export interface TruncationLink {
  readonly url: string;
  readonly label: string;
}

/**
 * Build the truncation notice string.
 *
 * When `link` is provided, the notice includes a clickable link with the
 * given label and URL. When absent, a generic message directs the reader
 * to the workflow run logs.
 *
 * @param link - Optional link to include in the notice
 * @returns A markdown string to append after truncated output
 */
export function buildTruncationNotice(link?: TruncationLink): string {
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
 *
 * @param link - Link to the workflow run logs
 * @returns A markdown string to append after the report body
 */
export function buildLogsNotice(link: TruncationLink): string {
  return `\n---\n\n> ${INFO_ICON} Some step errors are not shown — see the [${link.label}](${link.url}) for details.\n`;
}
