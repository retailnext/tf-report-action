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
 * Renders the step status table. Callers must only invoke this when
 * `report.steps.length > 0`.
 */
export function renderWorkflowBody(report: Report): Section[] {
  const stepTable = renderStepStatusTable(report.steps);
  return [{ id: "step-table", full: `### Steps\n\n${stepTable}` }];
}
