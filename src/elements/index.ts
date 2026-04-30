/**
 * Domain-specific ReportElement classes.
 *
 * Replaces `src/renderer/` with Renderable-composing classes at Layer 4.
 * Each class holds its domain data, composes primitive Renderable objects,
 * and renders itself to markdown or HTML at various detail levels.
 */

// Helpers
export {
  deriveModuleAddress,
  deriveInstanceName,
  groupByModule,
} from "./address.js";
export type { ModuleGroup } from "./address.js";

export {
  isApplyReport,
  buildFailedSet,
  buildDiagnosticMap,
  buildApplyContext,
  buildApplyContextFn,
  extractNonResourceDiagnostics,
} from "./apply-context.js";
export type { ApplyContext } from "./apply-context.js";

// Fixed elements
export {
  TitleElement,
  MarkerElement,
  WarningElement,
  UserTitleElement,
  LogsUrlElement,
} from "./title.js";

export { SummaryElement } from "./summary.js";
export { DiagnosticsElement } from "./diagnostics.js";
export { StepIssueElement } from "./step-issue.js";
export { WorkflowElement } from "./workflow.js";
export { ErrorMessageElement, ErrorStepTableElement } from "./error.js";
export { RawStdoutElement } from "./raw-stdout.js";

// Multi-level category elements
export {
  ResourceCategoryElement,
  DriftCategoryElement,
  OutputCategoryElement,
} from "./categories.js";

// Helpers for building resource/output renderables
export { buildStepTable } from "./step-table.js";
export { buildRawOutputRenderable } from "./raw-output.js";
export { buildResourceRenderable } from "./resource.js";
export type { ResourceRenderOptions } from "./resource.js";
export {
  buildModuleGroupRenderable,
  buildModuleGroupCompact,
} from "./module-group.js";
export { buildOutputsRenderable } from "./outputs.js";
export type { OutputRenderOptions } from "./outputs.js";
export {
  buildInlineDiff,
  buildLargeValueDiff,
  buildLargeValueContextDiff,
} from "./diff-value.js";
export type { DiffFormat } from "./diff-value.js";

// Text-fallback element
export { TextFallbackElement } from "./text-fallback.js";

// Factory
export { buildReportElements } from "./report-elements.js";
export type { BuildElementsOptions } from "./report-elements.js";

// ComposedReport
export { composeReport } from "./composed-report.js";
