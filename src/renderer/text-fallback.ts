/**
 * Text-fallback body renderer — renders raw stdout blocks into Sections.
 *
 * Used when structured plan JSON is unavailable but raw command stdout
 * was captured (Tier 3). With the unified Report model, this renders
 * the `rawStdout` entries as formatted code blocks.
 *
 * Note: Warnings are rendered by the parent `renderReportSections`
 * function, not here.
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";
import { formatRawOutput } from "../raw-formatter/index.js";
import { renderStepStatusTable } from "./step-table.js";

/**
 * Render the body sections for a report with raw stdout content
 * (no structured summary/modules).
 *
 * Includes: raw stdout blocks and a step status table when no output
 * was available.
 */
export function renderTextFallbackBody(report: Report): Section[] {
  const sections: Section[] = [];

  // Raw stdout blocks
  if (report.rawStdout.length > 0) {
    for (const raw of report.rawStdout) {
      const displayContent = raw.truncated
        ? raw.content + "\n… (truncated)"
        : raw.content;
      sections.push({
        id: `raw-${raw.stepId}`,
        full: `### ${raw.label}\n\n${formatRawOutput(displayContent)}\n\n`,
        compact: `### ${raw.label}\n\n_(omitted due to size)_\n\n`,
      });
    }
  } else {
    sections.push({
      id: "note",
      full: "> **Note:** No readable output was available for this run.\n\n",
      fixed: true,
    });
  }

  // Step statuses as fallback when no raw output available
  if (report.rawStdout.length === 0) {
    const stepTable = renderStepStatusTable(report.steps);
    if (stepTable.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps\n\n${stepTable}` });
    }
  }

  return sections;
}
