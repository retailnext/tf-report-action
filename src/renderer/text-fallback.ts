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

/**
 * Render the body sections for a report with raw stdout content
 * (no structured summary/modules).
 *
 * Renders raw stdout blocks. Callers must only invoke this when
 * `report.rawStdout.length > 0`.
 */
export function renderTextFallbackBody(report: Report): Section[] {
  const sections: Section[] = [];
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
  return sections;
}
