import type { Summary, SummaryActionGroup } from "../model/summary.js";
import type { PlanAction } from "../model/plan-action.js";
import type { MarkdownWriter } from "./writer.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { STATUS_FAILURE } from "../model/status-icons.js";

/** Present-tense labels for plan summaries. */
const PLAN_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Add",
  update: "Change",
  replace: "Replace",
  delete: "Destroy",
};

/** Past-tense labels for apply summaries. */
const APPLY_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Added",
  update: "Changed",
  replace: "Replaced",
  delete: "Destroyed",
};

/** Failure labels (used only for apply reports). */
const FAILURE_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Add failed",
  update: "Change failed",
  replace: "Replace failed",
  delete: "Destroy failed",
};

/**
 * Renders the summary table with one row per (action × resource type),
 * bold subtotal rows, and separate failure groups for apply reports.
 *
 * @param isApply - When true, uses past-tense labels and renders failure groups.
 */
export function renderSummary(
  summary: Summary,
  writer: MarkdownWriter,
  isApply = false,
): void {
  const labels = isApply ? APPLY_LABELS : PLAN_LABELS;
  const hasContent =
    summary.actions.length > 0 || summary.failures.length > 0;

  if (!hasContent) {
    writer.paragraph("_No changes._");
    return;
  }

  writer.tableHeader(["Action", "Resource", "Count"]);

  for (const group of summary.actions) {
    renderActionGroup(group, labels, ACTION_SYMBOLS[group.action], writer);
  }

  for (const group of summary.failures) {
    renderActionGroup(group, FAILURE_LABELS, STATUS_FAILURE, writer);
  }

  writer.blankLine();
}

function renderActionGroup(
  group: SummaryActionGroup,
  labels: Partial<Record<PlanAction, string>>,
  symbol: string,
  writer: MarkdownWriter,
): void {
  const label = labels[group.action] ?? group.action;

  for (let i = 0; i < group.resourceTypes.length; i++) {
    const rt = group.resourceTypes[i];
    if (!rt) continue;
    const actionCell = i === 0 ? `${symbol} ${label}` : "";
    writer.tableRow([actionCell, rt.type, String(rt.count)]);
  }

  // Bold subtotal row (always present)
  writer.tableRow(["", `**${label}**`, `**${String(group.total)}**`]);
}
