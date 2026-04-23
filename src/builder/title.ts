/**
 * Unified title generation — builds structured report titles from any
 * Report shape.
 *
 * One `buildTitle(report)` handles all cases: structured plan/apply,
 * JSONL-enriched, text fallback, workflow-only, error, and all-steps-skipped.
 * Evaluated top-to-bottom with first-match-wins semantics.
 *
 * Title logic is part of the builder because it's about constructing
 * a meaningful data structure from business data (summary counts, action
 * types, failure state). The element layer renders it.
 */

import type { Report } from "../model/report.js";
import type { Summary } from "../model/summary.js";
import type {
  ReportTitle,
  TitleBody,
  TitleActionCount,
  TitleOperation,
  TitleStatus,
} from "../model/report-title.js";

/**
 * Build a structured title for any Report shape. Inspects available data
 * (error, summary, operation, step failures, all-skipped) and produces
 * the appropriate title.
 *
 * Evaluation order (first match wins):
 * 1. Error → "error"
 * 2. IaC step failures + operation → "operation-failed"
 * 3. Summary + apply + apply errors → "summary" with failures
 * 4. Summary + apply + no changes → "summary" with empty counts
 * 5. Summary + apply + changes → "summary" with counts
 * 6. Summary + plan + no changes → "no-changes"
 * 7. Summary + plan + changes → "summary" with counts
 * 8. operationOutcome === "skipped" → "operation-skipped"
 * 9. All steps skipped → "all-skipped"
 * 10. No summary + single step failure → "step-failed"
 * 11. No summary + multiple failures → "generic-failed"
 * 12. No summary + all OK → "succeeded"
 */
export function buildTitle(report: Report): ReportTitle {
  const workspace = report.workspace;

  // 1. Error report
  if (report.error !== undefined) {
    return {
      status: "failure",
      ...(workspace !== undefined ? { workspace } : {}),
      body: { kind: "error" },
    };
  }

  const hasIacStepFailure = hasIacFailure(report);
  const hasAnyStepFailure = hasAnyFailure(report);

  // 2. IaC step failures
  if (hasIacStepFailure) {
    const op = normalizeOperation(report.operation);
    return {
      status: "failure",
      ...(workspace !== undefined ? { workspace } : {}),
      body:
        op !== undefined
          ? { kind: "operation-failed", operation: op }
          : { kind: "generic-failed" },
    };
  }

  // 3–7. Has summary (from show-plan JSON or JSONL scanner)
  if (report.summary) {
    return buildSummaryTitle(
      report.summary,
      report.operation ?? "plan",
      workspace,
      hasAnyStepFailure,
    );
  }

  // 8. Primary operation step was skipped
  if (report.operationOutcome === "skipped") {
    return {
      status: "warning",
      ...(workspace !== undefined ? { workspace } : {}),
      body: {
        kind: "operation-skipped",
        ...(() => {
          const op = normalizeOperation(report.operation);
          return op !== undefined ? { operation: op } : {};
        })(),
      },
    };
  }

  // 9. All steps skipped
  if (
    report.steps.length > 0 &&
    report.steps.every((s) => s.outcome === "skipped")
  ) {
    return {
      status: "warning",
      ...(workspace !== undefined ? { workspace } : {}),
      body: { kind: "all-skipped" },
    };
  }

  // 10–11. No summary — generic title based on failure state
  if (hasAnyStepFailure || report.issues.some((i) => i.isFailed)) {
    return {
      status: "failure",
      ...(workspace !== undefined ? { workspace } : {}),
      body: buildFailedBody(report),
    };
  }

  // 12. Success
  return {
    status: "success",
    ...(workspace !== undefined ? { workspace } : {}),
    body: {
      kind: "succeeded",
      ...(() => {
        const op = normalizeOperation(report.operation);
        return op !== undefined ? { operation: op } : {};
      })(),
    },
  };
}

// ─── Exported Helpers (used by summary table element) ───────────────────────

/** Build count parts for plan titles (e.g. [{ action: "create", count: 3 }]). */
export function buildPlanCounts(summary: Summary): TitleActionCount[] {
  const counts = new Map<string, number>();
  for (const group of summary.actions) {
    counts.set(group.action, (counts.get(group.action) ?? 0) + group.total);
  }
  return mapToActionCounts(counts);
}

/** Build count parts for apply titles (e.g. [{ action: "create", count: 3 }]). */
export function buildApplyCounts(summary: Summary): TitleActionCount[] {
  const counts = new Map<string, number>();
  for (const group of summary.actions) {
    counts.set(group.action, (counts.get(group.action) ?? 0) + group.total);
  }
  return mapToActionCounts(counts);
}

/** Build failure counts (e.g. [{ action: "failed", count: 2 }]). */
export function buildFailureCounts(summary: Summary): TitleActionCount[] {
  const total = summary.failures.reduce((sum, g) => sum + g.total, 0);
  if (total === 0) return [];
  return [{ action: "failed", count: total }];
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Build title when a summary is available. */
function buildSummaryTitle(
  summary: Summary,
  operation: TitleOperation,
  workspace: string | undefined,
  hasAnyStepFailure: boolean,
): ReportTitle {
  const hasFailures = summary.failures.length > 0;
  const status: TitleStatus =
    hasFailures || hasAnyStepFailure ? "failure" : "success";

  if (operation === "apply" || operation === "destroy") {
    const counts = buildApplyCounts(summary);
    const failures = buildFailureCounts(summary);
    const failureTotal = summary.failures.reduce((sum, g) => sum + g.total, 0);

    if (hasFailures) {
      return {
        status,
        ...(workspace !== undefined ? { workspace } : {}),
        body: {
          kind: "summary",
          operation,
          counts,
          failures,
          failureTotal,
          hasStepFailure: hasAnyStepFailure,
        },
      };
    }

    // Apply complete (including zero changes)
    return {
      status,
      ...(workspace !== undefined ? { workspace } : {}),
      body: {
        kind: "summary",
        operation,
        counts,
        failures: [],
        failureTotal: 0,
        hasStepFailure: hasAnyStepFailure,
      },
    };
  }

  // Plan mode
  const totalActions = summary.actions.reduce((sum, g) => sum + g.total, 0);
  if (totalActions === 0 && !hasFailures && !hasAnyStepFailure) {
    return {
      status,
      ...(workspace !== undefined ? { workspace } : {}),
      body: { kind: "no-changes" },
    };
  }

  if (hasFailures || hasAnyStepFailure) {
    return {
      status,
      ...(workspace !== undefined ? { workspace } : {}),
      body: {
        kind: "operation-failed",
        operation: "plan",
      },
    };
  }

  const counts = buildPlanCounts(summary);
  return {
    status,
    ...(workspace !== undefined ? { workspace } : {}),
    body: {
      kind: "summary",
      operation: "plan",
      counts,
      failures: [],
      failureTotal: 0,
      hasStepFailure: false,
    },
  };
}

/** Normalize an operation string to a TitleOperation, or undefined. */
function normalizeOperation(
  operation: string | undefined,
): TitleOperation | undefined {
  switch (operation) {
    case "apply":
    case "destroy":
    case "plan":
      return operation;
    default:
      return undefined;
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
 * Build the failure body — step-failed (single step) or generic-failed.
 */
function buildFailedBody(report: Report): TitleBody {
  const failedSteps = report.steps.filter((s) => s.outcome === "failure");
  if (failedSteps.length === 1) {
    const name = failedSteps[0]?.id ?? "unknown";
    return { kind: "step-failed", stepId: name };
  }
  return { kind: "generic-failed" };
}

/** Convert a Map<action, count> to TitleActionCount[]. */
function mapToActionCounts(counts: Map<string, number>): TitleActionCount[] {
  const result: TitleActionCount[] = [];
  for (const [action, count] of counts) {
    result.push({ action, count });
  }
  return result;
}
