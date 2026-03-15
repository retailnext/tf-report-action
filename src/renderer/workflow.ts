/**
 * Workflow body renderer — renders step statuses into Sections.
 *
 * Used when no plan/apply output is available at all (Tier 4).
 * Shows step outcomes and an optional link to full logs.
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";
import { renderStepStatusTable } from "./step-table.js";

/**
 * Render the body sections for a workflow-only report.
 *
 * Includes: step status table and logs link.
 */
export function renderWorkflowBody(report: Report): Section[] {
  const sections: Section[] = [];

  if (report.steps.length > 0) {
    const stepTable = renderStepStatusTable(report.steps);
    sections.push({ id: "step-table", full: `### Steps\n\n${stepTable}` });
  } else {
    sections.push({ id: "no-steps", full: "No steps were found in the workflow context.\n\n" });
  }

  if (report.logsUrl !== undefined) {
    sections.push({
      id: "logs-link",
      full: `[View workflow run logs](${report.logsUrl})\n`,
    });
  }

  return sections;
}
