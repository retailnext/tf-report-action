/**
 * Top-level report section renderer — checks report field presence to produce
 * an ordered array of Sections ready for the compositor.
 *
 * This is the "render" step for the reportFromSteps pipeline. It converts
 * any Report into Section[], which the compositor then assembles within a budget.
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";
import type { RenderOptions } from "./options.js";
import { renderReport } from "./index.js";
import { renderTitle, renderWorkspaceMarker } from "./title.js";
import { renderStepIssue } from "./step-issue.js";
import { renderTextFallbackBody } from "./text-fallback.js";
import { renderWorkflowBody } from "./workflow.js";
import { renderErrorBody } from "./error.js";
import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * Render a Report into an ordered array of Sections.
 *
 * Sections include: workspace marker (fixed), title (fixed), step issues,
 * warnings, and body sections determined by what report fields are populated.
 */
export function renderReportSections(
  report: Report,
  options?: RenderOptions,
): Section[] {
  const sections: Section[] = [];

  // Workspace dedup marker (always first if present)
  const marker = renderWorkspaceMarker(report);
  if (marker !== undefined) {
    sections.push(marker);
  }

  // Title
  sections.push(renderTitle(report));

  // Step issues
  for (const issue of report.issues) {
    sections.push(renderStepIssue(issue));
  }

  // Warnings (always rendered when present, before body)
  for (const warning of report.warnings) {
    sections.push({
      id: `warning-${warning.slice(0, 40)}`,
      full: `> ${DIAGNOSTIC_WARNING} **Warning:** ${warning}\n\n`,
      fixed: true,
    });
  }

  // Body sections — determined by which fields are populated
  if (report.error !== undefined) {
    // Error report
    sections.push(...renderErrorBody(report));
  } else if (report.summary !== undefined || report.modules !== undefined) {
    // Structured body (from show-plan JSON or JSONL enrichment)
    const bodyMarkdown = renderStructuredBody(report, options);
    sections.push({ id: "report-body", full: bodyMarkdown });
    // Also render any raw stdout blocks (e.g. plaintext plan + JSONL show-plan)
    sections.push(...renderRawStdoutSections(report));
  } else if (report.rawStdout.length > 0) {
    // Text fallback — raw stdout blocks only
    sections.push(...renderTextFallbackBody(report));
  } else if (report.steps.length > 0) {
    // Workflow-only — just step table
    sections.push(...renderWorkflowBody(report));
  }

  return sections;
}

/** Render the structured body of a Report using the existing renderer. */
function renderStructuredBody(
  report: Report,
  options?: RenderOptions,
): string {
  // Strip any user title — the title is handled by renderTitle() above
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { title: _discardTitle, ...renderOptsNoTitle } = options ?? {};
  return renderReport(report, renderOptsNoTitle);
}

/** Render raw stdout blocks as collapsible sections. */
function renderRawStdoutSections(report: Report): Section[] {
  const sections: Section[] = [];
  for (const raw of report.rawStdout) {
    const truncNote = raw.truncated ? "\n\n> **Note:** Output was truncated." : "";
    const full = `<details><summary>${raw.label}</summary>\n\n\`\`\`\n${raw.content}\n\`\`\`${truncNote}\n\n</details>\n\n`;
    sections.push({ id: `raw-${raw.stepId}`, full });
  }
  return sections;
}
