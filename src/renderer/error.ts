/**
 * Error body renderer — renders error-state reports into Sections.
 *
 * Used when the pipeline itself fails (invalid steps context, plan
 * parsing fails with no fallback, etc.).
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";
import { renderStepStatusTable } from "./step-table.js";

/**
 * Render the body sections for an error report.
 *
 * Includes: error message and optional step status table.
 */
export function renderErrorBody(report: Report): Section[] {
  const sections: Section[] = [];

  if (report.error !== undefined) {
    sections.push({ id: "message", full: `${report.error}\n\n` });
  }

  if (report.steps.length > 0) {
    const stepTable = renderStepStatusTable(report.steps);
    if (stepTable.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps\n\n${stepTable}` });
    }
  }

  return sections;
}
