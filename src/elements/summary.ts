/**
 * Summary element — renders the plan/apply summary table as a fixed
 * ReportElement (always shown at full detail).
 */

import type { Renderable, OutputFormat } from "../model/renderable.js";
import type { ReportElement } from "../renderable/types.js";
import type { Summary, SummaryActionGroup } from "../model/summary.js";
import type { PlanAction } from "../model/plan-action.js";
import { Table, Heading } from "../renderable/primitives.js";
import { renderNote } from "../renderable/helpers.js";
import { textCell, boldSpan } from "../renderable/helpers.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { STATUS_FAILURE } from "../model/status-icons.js";

/** Present-tense labels for plan summaries. */
const PLAN_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Add",
  update: "Change",
  replace: "Replace",
  delete: "Destroy",
  move: "Move",
  import: "Import",
  forget: "Forget",
};

/** Past-tense labels for apply summaries. */
const APPLY_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Added",
  update: "Changed",
  replace: "Replaced",
  delete: "Destroyed",
  move: "Moved",
  import: "Imported",
  forget: "Forgotten",
};

/** Failure labels (used only for apply reports). */
const FAILURE_LABELS: Partial<Record<PlanAction, string>> = {
  create: "Add failed",
  update: "Change failed",
  replace: "Replace failed",
  delete: "Destroy failed",
  move: "Move failed",
  import: "Import failed",
  forget: "Forget failed",
};

/**
 * A summary table with per-action resource type breakdowns.
 * Always fixed — never degraded by the composer.
 */
export class SummaryElement implements ReportElement {
  readonly id = "summary";
  readonly fixed = true;
  readonly levels = 1;

  private readonly heading: string;
  private readonly summary: Summary | undefined;
  private readonly isApply: boolean;

  constructor(heading: string, summary: Summary | undefined, isApply: boolean) {
    this.heading = heading;
    this.summary = summary;
    this.isApply = isApply;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.render(format, 0).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return renderSummary(this.heading, this.summary, this.isApply, format);
  }
}

/** Renders the summary as heading + table. */
function renderSummary(
  headingText: string,
  summary: Summary | undefined,
  isApply: boolean,
  format: OutputFormat,
): string {
  let result = new Heading(headingText, 2).render(format);

  if (!summary) {
    return result;
  }

  const labels = isApply ? APPLY_LABELS : PLAN_LABELS;
  const hasContent = summary.actions.length > 0 || summary.failures.length > 0;

  if (!hasContent) {
    result += renderNote("No changes.", format);
    return result;
  }

  const headers = [textCell("Action"), textCell("Resource"), textCell("Count")];
  const rows: { cells: Renderable[] }[] = [];

  for (const group of summary.actions) {
    addGroupRows(group, labels, ACTION_SYMBOLS[group.action], rows);
  }

  for (const group of summary.failures) {
    addGroupRows(group, FAILURE_LABELS, STATUS_FAILURE, rows);
  }

  result += new Table(headers, rows).render(format);
  return result;
}

/** Adds rows for a single action group to the table. */
function addGroupRows(
  group: SummaryActionGroup,
  labels: Partial<Record<PlanAction, string>>,
  symbol: string,
  rows: { cells: Renderable[] }[],
): void {
  const label = labels[group.action] ?? group.action;

  for (let i = 0; i < group.resourceTypes.length; i++) {
    const rt = group.resourceTypes[i];
    if (!rt) continue;
    const actionText = i === 0 ? `${symbol} ${label}` : "";
    rows.push({
      cells: [
        textCell(actionText),
        textCell(rt.type),
        textCell(String(rt.count)),
      ],
    });
  }

  // Bold subtotal row
  rows.push({
    cells: [textCell(""), boldSpan(label), boldSpan(String(group.total))],
  });
}
