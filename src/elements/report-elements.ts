/**
 * Report element factory — converts a Report model into an ordered array
 * of ReportElement objects ready for progressive composition.
 *
 * This replaces `renderReportSections` from `src/renderer/report-sections.ts`
 * and `renderStructuredSections` from `src/renderer/index.ts`.
 */

import type { ReportElement } from "../renderable/types.js";
import type { Report } from "../model/report.js";
import type { DiffEntry } from "../diff/types.js";
import type { DiffFormat } from "./diff-value.js";
import {
  TitleElement,
  MarkerElement,
  WarningElement,
  UserTitleElement,
} from "./title.js";
import { SummaryElement } from "./summary.js";
import { DiagnosticsElement } from "./diagnostics.js";
import { StepIssueElement } from "./step-issue.js";
import { TextFallbackElement } from "./text-fallback.js";
import { WorkflowElement } from "./workflow.js";
import { ErrorMessageElement, ErrorStepTableElement } from "./error.js";
import { RawStdoutElement } from "./raw-stdout.js";
import {
  ResourceCategoryElement,
  DriftCategoryElement,
  OutputCategoryElement,
} from "./categories.js";
import {
  isApplyReport,
  buildFailedSet,
  buildDiagnosticMap,
  buildApplyContext,
  extractNonResourceDiagnostics,
} from "./apply-context.js";

/**
 * Options for building report elements.
 */
export interface BuildElementsOptions {
  /** Display title for the report (library API use). */
  readonly title?: string | undefined;
  /** Diff format for inline attribute changes. */
  readonly diffFormat?: DiffFormat | undefined;
  /** Whether to show unchanged attributes. */
  readonly showUnchangedAttributes?: boolean | undefined;
}

/**
 * Builds an ordered array of ReportElement objects from a Report.
 *
 * The returned elements are in display order:
 * 1. Workspace marker (if present)
 * 2. Title
 * 3. Warnings
 * 4. Step issues
 * 5. Body (error / structured / text-fallback / workflow)
 */
export function buildReportElements(
  report: Report,
  options?: BuildElementsOptions,
): ReportElement[] {
  const elements: ReportElement[] = [];

  // 1. Workspace dedup marker
  if (report.workspace !== undefined) {
    elements.push(new MarkerElement(report.workspace));
  }

  // 2. Title
  elements.push(new TitleElement(report.title));

  // 3. Warnings
  for (let i = 0; i < report.warnings.length; i++) {
    const warning = report.warnings[i];
    if (warning !== undefined) {
      elements.push(new WarningElement(warning, i));
    }
  }

  // 4. Step issues
  for (const issue of report.issues) {
    elements.push(new StepIssueElement(issue));
  }

  // 5. Body — determined by which fields are populated
  if (report.error !== undefined) {
    elements.push(...buildErrorBody(report));
  } else if (report.summary !== undefined || report.resources !== undefined) {
    elements.push(...buildStructuredBody(report, options));
    elements.push(...buildRawStdoutElements(report));
  } else if (report.rawStdout.length > 0) {
    elements.push(...buildTextFallbackBody(report));
  } else if (report.steps.length > 0) {
    elements.push(new WorkflowElement(report.steps));
  }

  return elements;
}

/** Builds elements for the error report body. */
function buildErrorBody(report: Report): ReportElement[] {
  const elements: ReportElement[] = [];

  if (report.error !== undefined) {
    elements.push(new ErrorMessageElement(report.error));
  }

  if (report.steps.length > 0) {
    elements.push(new ErrorStepTableElement(report.steps));
  }

  return elements;
}

/** Builds elements for the structured report body. */
function buildStructuredBody(
  report: Report,
  options?: BuildElementsOptions,
): ReportElement[] {
  const diffCache = new Map<string, DiffEntry[]>();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";
  const resources = report.resources ?? [];
  const outputs = report.outputs ?? [];
  const driftResources = report.driftResources ?? [];
  const elements: ReportElement[] = [];

  // Build apply context
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);
  const applyContextFn = isApply
    ? (addr: string) => buildApplyContext(addr, failedAddresses, diagByAddress)
    : undefined;

  const renderOpts = {
    diffFormat: options?.diffFormat,
    showUnchangedAttributes: options?.showUnchangedAttributes,
  };

  // Optional user-provided title
  if (options?.title) {
    elements.push(new UserTitleElement(options.title));
  }

  // Summary (always shown when present)
  elements.push(new SummaryElement(summaryHeading, report.summary, isApply));

  // Non-resource diagnostics
  if (nonResourceDiags.length > 0) {
    elements.push(
      new DiagnosticsElement("non-resource-diagnostics", nonResourceDiags, 2),
    );
  }

  // Drift
  if (driftResources.length > 0) {
    elements.push(
      new DriftCategoryElement(driftResources, renderOpts, diffCache),
    );
  }

  // Resource changes
  if (resources.length > 0) {
    elements.push(
      new ResourceCategoryElement(
        resources,
        renderOpts,
        diffCache,
        applyContextFn,
      ),
    );
  }

  // Output changes
  if (outputs.length > 0) {
    elements.push(new OutputCategoryElement(outputs, renderOpts, diffCache));
  }

  return elements;
}

/** Builds raw stdout collapsible elements. */
function buildRawStdoutElements(report: Report): ReportElement[] {
  return report.rawStdout.map(
    (raw) => new RawStdoutElement(raw.stepId, raw.label, raw.content),
  );
}

/** Builds text fallback elements. */
function buildTextFallbackBody(report: Report): ReportElement[] {
  return report.rawStdout.map(
    (raw) => new TextFallbackElement(raw.stepId, raw.label, raw.content),
  );
}
