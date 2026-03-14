/**
 * Top-level report section renderer — dispatches on report kind to produce
 * an ordered array of Sections ready for the compositor.
 *
 * This is the "render" step for the reportFromSteps pipeline. It converts
 * any Report variant into Section[], which the compositor then assembles
 * within a budget.
 */

import type { Report, StructuredReport } from "../model/report.js";
import type { Section } from "../model/section.js";
import type { RenderOptions } from "./options.js";
import { renderReport } from "./index.js";
import { renderTitle, renderWorkspaceMarker } from "./title.js";
import { renderStepIssue } from "./step-issue.js";
import { renderTextFallbackBody } from "./text-fallback.js";
import { renderWorkflowBody } from "./workflow.js";
import { renderErrorBody } from "./error.js";

/**
 * Render any Report variant into an ordered array of Sections.
 *
 * Sections include: workspace marker (fixed), title (fixed), step issues,
 * and the variant-specific body sections.
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

  // Step issues (common across structured and text-fallback)
  const issues = getIssues(report);
  for (const issue of issues) {
    sections.push(renderStepIssue(issue));
  }

  // Body sections (variant-specific)
  switch (report.kind) {
    case "structured": {
      const bodyMarkdown = renderStructuredBody(report, options);
      sections.push({ id: "report-body", full: bodyMarkdown });
      break;
    }
    case "text-fallback": {
      sections.push(...renderTextFallbackBody(report));
      break;
    }
    case "workflow": {
      sections.push(...renderWorkflowBody(report));
      break;
    }
    case "error": {
      sections.push(...renderErrorBody(report));
      break;
    }
  }

  return sections;
}

/** Render the body of a StructuredReport using the existing renderer. */
function renderStructuredBody(
  report: StructuredReport,
  options?: RenderOptions,
): string {
  // Strip any user title — the title is handled by renderTitle() above
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { title: _discardTitle, ...renderOptsNoTitle } = options ?? {};
  return renderReport(report, renderOptsNoTitle);
}

/** Extract issues from report variants that carry them. */
function getIssues(report: Report): readonly import("../model/step-issue.js").StepIssue[] {
  switch (report.kind) {
    case "structured":
      return report.issues;
    case "text-fallback":
      return report.issues;
    default:
      return [];
  }
}
