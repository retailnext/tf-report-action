/**
 * Error body renderer — renders an ErrorReport into Sections.
 *
 * Used when the pipeline itself fails (invalid steps context, plan
 * parsing fails with no fallback, etc.).
 */

import type { ErrorReport } from "../model/report.js";
import type { Section } from "../model/section.js";
import { renderStepStatusTable } from "./step-table.js";

/**
 * Render the body sections for an error report.
 *
 * Includes: error message and optional step status table.
 */
export function renderErrorBody(report: ErrorReport): Section[] {
  const sections: Section[] = [];

  sections.push({ id: "message", full: `${report.message}\n\n` });

  if (report.steps !== undefined && report.steps.length > 0) {
    const stepTable = renderStepStatusTable(report.steps);
    if (stepTable.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps\n\n${stepTable}` });
    }
  }

  return sections;
}
