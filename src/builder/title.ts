/**
 * Unified title generation — builds report titles from any Report shape.
 *
 * One `buildTitle(report)` handles all cases: structured plan/apply,
 * JSONL-enriched, text fallback, workflow-only, error, and all-steps-skipped.
 * Evaluated top-to-bottom with first-match-wins semantics.
 *
 * Title logic is part of the builder because it's about constructing
 * a meaningful data field (the title string) from business data (summary
 * counts, action types, failure state). The renderer just renders it.
 */

import type { Report } from "../model/report.js";
import type { Summary } from "../model/summary.js";
import {
  STATUS_SUCCESS,
  STATUS_FAILURE,
  DIAGNOSTIC_WARNING,
} from "../model/status-icons.js";

/**
 * Build a title for any Report shape. Inspects available data (error,
 * summary, operation, step failures, all-skipped) and produces the
 * appropriate title.
 *
 * Evaluation order (first match wins):
 * 1. Error → "❌ Report Generation Failed"
 * 2. IaC step failures + operation → "❌ Plan/Apply Failed"
 * 3. Summary + apply + apply errors → "⚠️ Apply: N failed, ..."
 * 4. Summary + apply + no changes → "✅ Apply Complete"
 * 5. Summary + apply + changes → "✅ Apply: N added, ..."
 * 6. Summary + plan + no changes → "✅ No Changes"
 * 7. Summary + plan + changes → "✅ Plan: N to add, ..."
 * 8. All steps skipped → "⚠️ All Steps Skipped"
 * 9. No summary + failures → "❌ Failed"
 * 10. No summary + all OK → "✅ Succeeded"
 */
export function buildTitle(report: Report): string {
  const wsPrefix = report.workspace ? `\`${report.workspace}\` ` : "";

  // 1. Error report
  if (report.error !== undefined) {
    return `${STATUS_FAILURE} ${wsPrefix}Report Generation Failed`;
  }

  const hasIacStepFailure = hasIacFailure(report);
  const hasAnyStepFailure = hasAnyFailure(report);

  // 2. IaC step failures
  if (hasIacStepFailure) {
    const op = operationLabel(report.operation);
    const label = op ? `${op} Failed` : "Failed";
    return `${STATUS_FAILURE} ${wsPrefix}${label}`;
  }

  // 3–7. Has summary (from show-plan JSON or JSONL scanner)
  if (report.summary) {
    return buildSummaryTitle(
      report.summary,
      report.operation ?? "plan",
      wsPrefix,
      hasAnyStepFailure,
    );
  }

  // 8. All steps skipped
  if (
    report.steps.length > 0 &&
    report.steps.every((s) => s.outcome === "skipped")
  ) {
    return `${DIAGNOSTIC_WARNING} ${wsPrefix}All Steps Skipped`;
  }

  // 9–10. No summary — generic title based on failure state
  if (hasAnyStepFailure || report.issues.some((i) => i.isFailed)) {
    const failLabel = singleFailedStepLabel(report);
    return `${STATUS_FAILURE} ${wsPrefix}${failLabel}`;
  }

  // Include operation label when known (e.g., "Plan Succeeded", "Apply Succeeded")
  const opLabel = report.operation
    ? `${operationLabel(report.operation)} `
    : "";
  return `${STATUS_SUCCESS} ${wsPrefix}${opLabel}Succeeded`;
}

// ─── Exported Helpers (used by renderers for summary tables) ────────────────

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

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Build title when a summary is available. */
function buildSummaryTitle(
  summary: Summary,
  operation: "plan" | "apply" | "destroy",
  wsPrefix: string,
  hasAnyStepFailure: boolean,
): string {
  const hasFailures = summary.failures.length > 0;
  const icon =
    hasFailures || hasAnyStepFailure ? STATUS_FAILURE : STATUS_SUCCESS;

  if (operation === "apply" || operation === "destroy") {
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
  if (totalActions === 0 && !hasFailures && !hasAnyStepFailure) {
    return `${icon} ${wsPrefix}No Changes`;
  }

  if (hasFailures || hasAnyStepFailure) {
    return `${icon} ${wsPrefix}Plan Failed`;
  }

  const parts = buildPlanCountParts(summary);
  return `${icon} ${wsPrefix}Plan: ${parts.join(", ")}`;
}

/** Returns a human-readable operation label. */
function operationLabel(operation: string | undefined): string {
  switch (operation) {
    case "apply":
      return "Apply";
    case "destroy":
      return "Destroy";
    case "plan":
      return "Plan";
    default:
      return "";
  }
}

/**
 * Checks whether any step with an IaC role (plan, apply, show-plan, validate, init)
 * has failed. Used to determine if the title should show a failure state.
 */
function hasIacFailure(report: Report): boolean {
  const iacRoles = new Set(["plan", "apply", "show-plan", "validate", "init"]);
  return (
    report.steps.some((s) => s.outcome === "failure" && iacRoles.has(s.id)) ||
    report.issues.some((i) => i.isFailed && iacRoles.has(i.id))
  );
}

/** Checks whether any step has failed. */
function hasAnyFailure(report: Report): boolean {
  return report.steps.some((s) => s.outcome === "failure");
}

/**
 * When exactly one step failed, use its name in the title.
 * Otherwise return a generic "Failed".
 */
function singleFailedStepLabel(report: Report): string {
  const failedSteps = report.steps.filter((s) => s.outcome === "failure");
  if (failedSteps.length === 1) {
    const name = failedSteps[0]?.id ?? "unknown";
    return `\`${name}\` Failed`;
  }
  return "Failed";
}

function formatCountParts(
  counts: Map<string, number>,
  prefix: string,
): string[] {
  const parts: string[] = [];
  for (const [label, count] of counts) {
    parts.push(`${String(count)} ${prefix}${label}`);
  }
  return parts;
}

function planActionLabel(action: string): string {
  switch (action) {
    case "create":
      return "add";
    case "update":
      return "change";
    case "delete":
      return "destroy";
    case "replace":
      return "replace";
    case "import":
      return "import";
    case "move":
      return "move";
    case "forget":
      return "forget";
    default:
      return action;
  }
}

function applyActionLabel(action: string): string {
  switch (action) {
    case "create":
      return "added";
    case "update":
      return "changed";
    case "delete":
      return "destroyed";
    case "replace":
      return "replaced";
    case "import":
      return "imported";
    case "move":
      return "moved";
    case "forget":
      return "forgotten";
    default:
      return action;
  }
}
