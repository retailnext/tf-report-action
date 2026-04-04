import type { Report } from "../model/report.js";
import type { ResourceChange } from "../model/resource.js";
import type { RenderOptions } from "./options.js";
import type { Section } from "../model/section.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "./writer.js";
import { renderSummary } from "./summary.js";
import { renderDiagnostics } from "./diagnostics.js";
import { DRIFT_ICON } from "../model/status-icons.js";
import {
  isApplyReport,
  buildFailedSet,
  buildDiagnosticMap,
  extractNonResourceDiagnostics,
  buildApplyContext,
} from "./apply-context.js";
import {
  groupByModule,
  moduleLabel,
  renderModuleSection,
} from "./module-section.js";
import { renderOutputs } from "./outputs.js";

// Re-export address helpers for use by other renderer files and tests
export { deriveModuleAddress, deriveInstanceName } from "./address.js";

/**
 * Ensure content ends with exactly two newlines (a trailing blank line).
 *
 * Sections are concatenated without separators, so each must end with
 * `\n\n` to provide the required blank line before the next markdown
 * heading or block element.
 */
export function ensureTrailingBlankLine(content: string): string {
  const trimmed = content.replace(/\n+$/, "");
  return trimmed + "\n\n";
}

/**
 * Renders a Report's structured body as an array of compositable Sections.
 *
 * Each major part (summary, drift, resource groups, outputs, diagnostics)
 * is a separate Section so the compositor can degrade or omit individual
 * sections under budget pressure.
 *
 * Resources are grouped by module address (derived from each resource's
 * `address` and `type`) for display — this is purely a rendering concern.
 */
export function renderStructuredSections(
  report: Report,
  options: RenderOptions = {},
): Section[] {
  const diffCache = new Map<string, DiffEntry[]>();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";
  const summary = report.summary;
  const resources = report.resources ?? [];
  const outputs = report.outputs ?? [];
  const driftResources = report.driftResources ?? [];
  const sections: Section[] = [];

  // Build apply context lookup
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);
  const applyContextFn = isApply
    ? (addr: string) => buildApplyContext(addr, failedAddresses, diagByAddress)
    : undefined;

  // Optional user-provided title (used by library API, not reportFromSteps)
  if (options.title) {
    sections.push({
      id: "user-title",
      full: `## ${options.title}\n\n`,
      fixed: true,
    });
  }

  // Summary section (always shown when present)
  {
    const writer = new MarkdownWriter();
    writer.heading(summaryHeading, 2);
    if (summary) {
      renderSummary(summary, writer, isApply);
    }
    sections.push({
      id: "summary",
      full: ensureTrailingBlankLine(writer.build()),
      fixed: true,
    });
  }

  // Non-resource diagnostics (between summary and resource changes)
  if (nonResourceDiags.length > 0) {
    const writer = new MarkdownWriter();
    renderDiagnostics(nonResourceDiags, writer, 2);
    sections.push({
      id: "non-resource-diagnostics",
      full: ensureTrailingBlankLine(writer.build()),
      fixed: true,
    });
  }

  // Drift — heading + per-module flex sections
  if (driftResources.length > 0) {
    sections.push(...renderDriftSections(driftResources, options, diffCache));
  }

  // Resource changes — heading + one flex section per module group
  const moduleGroups = groupByModule(resources);
  if (moduleGroups.length > 0) {
    sections.push(
      ...renderResourceSections(
        moduleGroups,
        options,
        diffCache,
        applyContextFn,
      ),
    );
  }

  // Top-level outputs
  if (outputs.length > 0) {
    const writer = new MarkdownWriter();
    writer.heading("Output Changes", 2);
    renderOutputs(outputs, writer, options, diffCache);
    sections.push({
      id: "outputs",
      full: ensureTrailingBlankLine(writer.build()),
    });
  }

  return sections;
}

/**
 * Renders a Report's structured body to a markdown string.
 *
 * Convenience wrapper around `renderStructuredSections` for the library
 * API (`planToMarkdown`, `applyToMarkdown`) where the output is not
 * budget-constrained.
 */
export function renderReport(
  report: Report,
  options: RenderOptions = {},
): string {
  return renderStructuredSections(report, options)
    .map((s) => s.full)
    .join("");
}

/** Renders the "Resource Changes" heading + per-module flex sections. */
function renderResourceSections(
  moduleGroups: import("./module-section.js").RendererModuleGroup[],
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  applyContextFn?: (
    address: string,
  ) => import("./apply-context.js").ApplyContext,
): Section[] {
  const sections: Section[] = [];

  const hw = new MarkdownWriter();
  hw.heading("Resource Changes", 2);
  sections.push({
    id: "resource-changes-heading",
    full: ensureTrailingBlankLine(hw.build()),
    fixed: true,
  });

  for (const moduleGroup of moduleGroups) {
    const label = moduleLabel(moduleGroup.moduleAddress);
    const mw = new MarkdownWriter();
    renderModuleSection(
      moduleGroup,
      mw,
      options,
      diffCache,
      "full",
      applyContextFn,
    );

    sections.push({
      id: `module-${moduleGroup.moduleAddress || "root"}`,
      full: ensureTrailingBlankLine(mw.build()),
      compact: `### ${label}\n\n_(details omitted)_\n\n`,
    });
  }

  return sections;
}

/** Renders drift heading + per-module flex sections. */
function renderDriftSections(
  driftResources: readonly ResourceChange[],
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): Section[] {
  const sections: Section[] = [];

  const hw = new MarkdownWriter();
  hw.heading(
    `${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`,
    2,
  );
  sections.push({
    id: "drift-heading",
    full: ensureTrailingBlankLine(hw.build()),
    fixed: true,
  });

  const driftModules = groupByModule(driftResources);
  for (const moduleGroup of driftModules) {
    const label = moduleLabel(moduleGroup.moduleAddress);
    const mw = new MarkdownWriter();
    renderModuleSection(moduleGroup, mw, options, diffCache, "full");

    sections.push({
      id: `drift-module-${moduleGroup.moduleAddress || "root"}`,
      full: ensureTrailingBlankLine(mw.build()),
      compact: `### ${label}\n\n_(details omitted)_\n\n`,
    });
  }

  return sections;
}
