/**
 * Truncation notice builder — produces the truncation warning appended
 * when the compositor had to degrade or omit sections.
 */

import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * Build the truncation notice string.
 *
 * @param logsUrl - Optional URL to the full workflow run logs
 * @returns A markdown string to append after truncated output
 */
export function buildTruncationNotice(logsUrl: string | undefined): string {
  if (logsUrl !== undefined) {
    return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit.\n> [View full workflow run logs](${logsUrl})\n`;
  }
  return `\n---\n\n> ${DIAGNOSTIC_WARNING} **Output truncated** — some details were shortened or omitted to fit within the comment size limit. Check the workflow run logs for complete output.\n`;
}
