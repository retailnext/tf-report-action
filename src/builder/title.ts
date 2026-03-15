/**
 * Title generation — builds report titles from Report models.
 *
 * Title logic is part of the builder because it's about constructing
 * a meaningful data field (the title string) from business data (summary
 * counts, action types, failure state). The renderer just renders it.
 */

import type { Report } from "../model/report.js";
import type { Summary } from "../model/summary.js";
import { STATUS_SUCCESS, STATUS_FAILURE } from "../model/status-icons.js";

/**
 * Build a title for a structured report (plan or apply) that has a summary.
 *
 * @param report - The report with summary data
 * @param isApply - Whether this is an apply report
 * @param workspace - Optional workspace name for title prefix
 * @param hasStepFailures - Whether any workflow steps failed
 */
export function buildStructuredTitle(
  report: Report,
  isApply: boolean,
  workspace: string | undefined,
  hasStepFailures: boolean,
): string {
  const summary = report.summary;
  if (!summary) {
    // No summary data — fall back to a generic title
    const icon = hasStepFailures ? STATUS_FAILURE : STATUS_SUCCESS;
    const wsPrefix = workspace ? `\`${workspace}\` ` : "";
    return `${icon} ${wsPrefix}${isApply ? "Apply" : "Plan"}`;
  }
  const hasFailures = summary.failures.length > 0;
  const icon = hasFailures || hasStepFailures ? STATUS_FAILURE : STATUS_SUCCESS;
  const wsPrefix = workspace ? `\`${workspace}\` ` : "";

  if (isApply) {
    const parts = buildApplyCountParts(summary);
    if (hasFailures) {
      const failParts = buildFailureCountParts(summary);
      return `${icon} ${wsPrefix}Apply Failed: ${[...failParts, ...parts].join(", ")}`;
    }
    if (parts.length === 0) {
      return `${icon} ${wsPrefix}Apply Complete`;
    }
    return `${icon} ${wsPrefix}Apply: ${parts.join(", ")}`;
  }

  // Plan mode
  const totalActions = summary.actions.reduce((sum, g) => sum + g.total, 0);
  if (totalActions === 0 && !hasFailures && !hasStepFailures) {
    return `${icon} ${wsPrefix}No Changes`;
  }

  if (hasFailures || hasStepFailures) {
    return `${icon} ${wsPrefix}Plan Failed`;
  }

  const parts = buildPlanCountParts(summary);
  return `${icon} ${wsPrefix}Plan: ${parts.join(", ")}`;
}

/** Build count parts for plan titles (e.g. "3 to add, 1 to change"). */
export function buildPlanCountParts(summary: Summary): string[] {
  const counts = new Map<string, number>();
  for (const group of summary.actions) {
    const label = planActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "to ");
}

/** Build count parts for apply titles (e.g. "3 added, 1 changed"). */
export function buildApplyCountParts(summary: Summary): string[] {
  const counts = new Map<string, number>();
  for (const group of summary.actions) {
    const label = applyActionLabel(group.action);
    counts.set(label, (counts.get(label) ?? 0) + group.total);
  }
  return formatCountParts(counts, "");
}

/** Build failure count parts (e.g. "2 failed"). */
export function buildFailureCountParts(summary: Summary): string[] {
  const total = summary.failures.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return [];
  return [`${String(total)} failed`];
}

function formatCountParts(counts: Map<string, number>, prefix: string): string[] {
  const parts: string[] = [];
  for (const [label, count] of counts) {
    parts.push(`${String(count)} ${prefix}${label}`);
  }
  return parts;
}

function planActionLabel(action: string): string {
  switch (action) {
    case "create": return "add";
    case "update": return "change";
    case "delete": return "destroy";
    case "replace": return "replace";
    case "import": return "import";
    case "move": return "move";
    case "forget": return "forget";
    default: return action;
  }
}

function applyActionLabel(action: string): string {
  switch (action) {
    case "create": return "added";
    case "update": return "changed";
    case "delete": return "destroyed";
    case "replace": return "replaced";
    case "import": return "imported";
    case "move": return "moved";
    case "forget": return "forgotten";
    default: return action;
  }
}
