/**
 * Comment footer construction.
 *
 * Builds the footer appended to every comment/issue body, and provides
 * budget calculation for how much space the report content may use.
 */

import type { Env } from "../env/index.js";

/** GitHub comment body hard limit (characters). */
export const COMMENT_LIMIT = 65_536;

/** Reserved bytes for internal overhead (metadata, fencing, etc.). */
export const OVERHEAD_RESERVE = 512;

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

/** Build the logs URL from environment variables. */
export function buildLogsUrl(env: Env): string {
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
export function parseRepo(
  env: Env,
): { owner: string; repo: string } | undefined {
  const full = env["GITHUB_REPOSITORY"];
  if (full === undefined || full === "") return undefined;
  const slash = full.indexOf("/");
  if (slash <= 0 || slash === full.length - 1) return undefined;
  return { owner: full.slice(0, slash), repo: full.slice(slash + 1) };
}

/**
 * Build the comment footer line.
 *
 * PR comments get a simple logs link. Issue comments additionally
 * include a "Last updated" timestamp (since issues persist longer).
 *
 * @param logsUrl - URL to the workflow run logs
 * @param isPr - Whether this is a pull request context
 * @param now - Current time (injectable for testing)
 */
export function buildFooter(
  logsUrl: string,
  isPr: boolean,
  now: Date = new Date(),
): string {
  if (isPr) {
    return `\n---\n\n[View logs](${logsUrl})\n`;
  }
  return `\n---\n\n[View logs](${logsUrl}) • Last updated: ${formatTimestamp(now)}\n`;
}

/**
 * Calculate the available budget for report content.
 *
 * Subtracts the footer length and overhead reserve from the comment limit.
 */
export function calculateBudget(footerLength: number): number {
  return Math.max(0, COMMENT_LIMIT - footerLength - OVERHEAD_RESERVE);
}
