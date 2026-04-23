/**
 * Summary element — renders the plan/apply summary table as a fixed
 * ReportElement (always shown at full detail).
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ReportElement } from "../renderable/types.js";
import type { Summary, SummaryActionGroup } from "../model/summary.js";
import type { PlanAction } from "../model/plan-action.js";
import { Table, RawText, Heading, Sequence } from "../renderable/primitives.js";
import { renderNote, noteSize } from "../renderable/helpers.js";
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

  private readonly renderable: Renderable;

  constructor(heading: string, summary: Summary | undefined, isApply: boolean) {
    this.renderable = buildSummaryRenderable(heading, summary, isApply);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(format: OutputFormat, _level: number): number {
    return this.renderable.size(format);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(format: OutputFormat, _level: number): string {
    return this.renderable.render(format);
  }
}

/** Builds the summary as a Renderable tree. */
function buildSummaryRenderable(
  headingText: string,
  summary: Summary | undefined,
  isApply: boolean,
): Renderable {
  const parts: Renderable[] = [new Heading(headingText, 2)];

  if (!summary) {
    return new Sequence(parts);
  }

  const labels = isApply ? APPLY_LABELS : PLAN_LABELS;
  const hasContent = summary.actions.length > 0 || summary.failures.length > 0;

  if (!hasContent) {
    parts.push(new NoteRenderable("No changes."));
    return new Sequence(parts);
  }

  // Build table rows
  const headers = [
    new RawText("Action"),
    new RawText("Resource"),
    new RawText("Count"),
  ];
  const rows: { cells: Renderable[] }[] = [];

  for (const group of summary.actions) {
    addGroupRows(group, labels, ACTION_SYMBOLS[group.action], rows);
  }

  for (const group of summary.failures) {
    addGroupRows(group, FAILURE_LABELS, STATUS_FAILURE, rows);
  }

  parts.push(new Table(headers, rows));
  return new Sequence(parts);
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
    const actionCell = i === 0 ? `${symbol} ${label}` : "";
    rows.push({
      cells: [
        new RawText(actionCell),
        new RawText(rt.type),
        new RawText(String(rt.count)),
      ],
    });
  }

  // Bold subtotal row
  rows.push({
    cells: [
      new RawText(""),
      new BoldText(label),
      new BoldText(String(group.total)),
    ],
  });
}

/** Bold text renderable — `**text**` in markdown, `<strong>text</strong>` in HTML. */
class BoldText implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `**${text}**`;
    this.htStr = `<strong>${text}</strong>`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

/** Contextual note — italic in markdown, `<em>` in HTML. */
class NoteRenderable implements Renderable {
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  size(format: OutputFormat): number {
    return noteSize(this.text, format);
  }

  render(format: OutputFormat): string {
    return renderNote(this.text, format);
  }
}
