/**
 * Text-fallback body renderer — renders a TextFallbackReport into Sections.
 *
 * Used when structured plan JSON is unavailable but raw command stdout
 * was captured (Tier 3).
 */

import type { TextFallbackReport } from "../model/report.js";
import type { Section } from "../model/section.js";
import { formatRawOutput } from "../raw-formatter/index.js";
import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";
import { renderStepStatusTable } from "./step-table.js";

/**
 * Render the body sections for a text-fallback report.
 *
 * Includes: read error warnings, structural note, raw plan/apply output,
 * and a step status table when no output was available.
 */
export function renderTextFallbackBody(report: TextFallbackReport): Section[] {
  const sections: Section[] = [];

  // Read errors as standalone warnings
  for (const err of report.readErrors) {
    sections.push({
      id: `read-error-${err}`,
      full: `### ${err}\n\n`,
      fixed: true,
    });
  }

  // Structural note
  if (report.hasOutput) {
    sections.push({
      id: "note",
      full: `> ${DIAGNOSTIC_WARNING} **Warning:** Structured plan output was not available. Showing raw command output.\n\n`,
      fixed: true,
    });
  } else if (report.readErrors.length === 0) {
    sections.push({
      id: "note",
      full: "> **Note:** No readable output was available for this run.\n\n",
      fixed: true,
    });
  }

  // Plan output
  if (report.planContent !== undefined) {
    const displayContent = report.planTruncated === true
      ? report.planContent + "\n… (truncated)"
      : report.planContent;
    sections.push({
      id: "plan-output",
      full: `### Plan Output\n\n${formatRawOutput(displayContent)}\n\n`,
      compact: "### Plan Output\n\n_(omitted due to size)_\n\n",
    });
  }

  // Apply output
  if (report.applyContent !== undefined) {
    const displayContent = report.applyTruncated === true
      ? report.applyContent + "\n… (truncated)"
      : report.applyContent;
    sections.push({
      id: "apply-output",
      full: `### Apply Output\n\n${formatRawOutput(displayContent)}\n\n`,
      compact: "### Apply Output\n\n_(omitted due to size)_\n\n",
    });
  }

  // Step statuses as fallback when no output available
  if (!report.hasOutput) {
    const stepTable = renderStepStatusTable(report.steps);
    if (stepTable.length > 0) {
      sections.push({ id: "step-statuses", full: `### Steps\n\n${stepTable}` });
    }
  }

  return sections;
}
