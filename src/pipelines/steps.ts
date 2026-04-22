import type { ReportOptions } from "../builder/report-from-steps.js";
export type { ReportOptions };
import type { ComposedReport } from "../renderable/types.js";
import { buildReportFromSteps } from "../builder/report-from-steps.js";
import { buildReportElements } from "../elements/report-elements.js";
import { composeReport } from "../elements/composed-report.js";
import { STATUS_FAILURE } from "../model/status-icons.js";
import { RawText } from "../renderable/primitives.js";

/**
 * Result of generating a report from a GitHub Actions steps context.
 *
 * The report is a {@link ComposedReport} that can render itself to markdown
 * or HTML on demand with optional budget constraints. The caller decides
 * format and limit:
 *
 * ```typescript
 * const result = reportFromSteps(stepsJson, options);
 * const md = result.report.render("markdown", budget);
 * if (md.truncated) {
 *   const html = result.report.render("html"); // full detail
 *   uploadArtifact(buildHtmlPage(html.output, title));
 * }
 * postComment(md.output);
 * ```
 */
export interface ReportFromStepsResult {
  /** The assembled report, ready for rendering at any format and budget. */
  readonly report: ComposedReport;
  /** The detected operation type, if determinable from step context. */
  readonly operation?: "plan" | "apply" | "destroy";
  /** Whether any step failed without captured stdout/stderr output. */
  readonly hasUnresolvedFailures: boolean;
}

/**
 * Generates a report from a GitHub Actions steps context JSON string.
 *
 * **Never throws.** All errors become report content. Returns a
 * {@link ReportFromStepsResult} whose `report` field renders to markdown
 * or HTML on demand.
 *
 * This is the third pipeline, following the same parse → build → compose
 * pattern as planReport and applyReport, but with error wrapping.
 *
 * @param stepsJson - JSON-encoded GitHub Actions steps context
 * @param options - Report generation options
 * @returns Structured result with a renderable report and metadata
 */
export function reportFromSteps(
  stepsJson: string,
  options?: ReportOptions,
): ReportFromStepsResult {
  try {
    const report = buildReportFromSteps(stepsJson, options);
    const elements = buildReportElements(report, options);
    const composed = composeReport(elements);

    return {
      report: composed,
      ...(report.operation !== undefined && { operation: report.operation }),
      hasUnresolvedFailures: report.hasUnresolvedFailures ?? false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorRenderable = new RawText(
      `## ${STATUS_FAILURE} Report Generation Failed\n\nAn unexpected error occurred while generating the report:\n\n\`\`\`\n${message}\n\`\`\`\n`,
    );
    const errorReport: ComposedReport = {
      render: (format) => ({
        output: errorRenderable.render(format),
        truncated: false,
      }),
      fullSize: (format) => errorRenderable.size(format),
    };
    return {
      report: errorReport,
      hasUnresolvedFailures: false,
    };
  }
}
