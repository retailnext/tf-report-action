import type { Report } from "../model/report.js";
import type { RenderOptions } from "./options.js";
import type { Section } from "../model/section.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { DiffEntry } from "../diff/types.js";
import type { OutputChange } from "../model/output.js";
import { MarkdownWriter } from "./writer.js";
import { renderSummary } from "./summary.js";
import { renderResource } from "./resource.js";
import type { ApplyContext } from "./resource.js";
import { renderDiagnostics } from "./diagnostics.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { MODULE_ICON, DRIFT_ICON } from "../model/status-icons.js";
import { resolveTemplate } from "../template/index.js";

/**
 * Ensure content ends with exactly two newlines (a trailing blank line).
 *
 * Sections are concatenated without separators, so each must end with
 * `\n\n` to provide the required blank line before the next markdown
 * heading or block element.
 */
function ensureTrailingBlankLine(content: string): string {
  const trimmed = content.replace(/\n+$/, "");
  return trimmed + "\n\n";
}

/**
 * Renders a Report's structured body as an array of compositable Sections.
 *
 * Each major part (summary, drift, module groups, outputs, diagnostics)
 * is a separate Section so the compositor can degrade or omit individual
 * sections under budget pressure.
 *
 * Requires that the report has `summary` or `modules` populated (i.e.,
 * from show-plan JSON or JSONL enrichment).
 */
export function renderStructuredSections(
  report: Report,
  options: RenderOptions = {},
): Section[] {
  const template = resolveTemplate(options.template ?? "default");
  const diffCache = new Map<string, DiffEntry[]>();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";
  const summary = report.summary;
  const modules = report.modules ?? [];
  const outputs = report.outputs ?? [];
  const driftModules = report.driftModules ?? [];
  const sections: Section[] = [];

  // Build apply context maps
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);

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
    if (template.name === "summary" && report.diagnostics !== undefined && report.diagnostics.length > 0) {
      renderDiagnostics(report.diagnostics, writer, 2);
    }
    sections.push({ id: "summary", full: ensureTrailingBlankLine(writer.build()), fixed: true });
  }

  if (template.name === "summary") {
    return sections;
  }

  // Non-resource diagnostics (between summary and resource changes)
  if (nonResourceDiags.length > 0) {
    const writer = new MarkdownWriter();
    renderDiagnostics(nonResourceDiags, writer, 2);
    sections.push({ id: "non-resource-diagnostics", full: ensureTrailingBlankLine(writer.build()), fixed: true });
  }

  // Drift section
  if (driftModules.length > 0) {
    const writer = new MarkdownWriter();
    renderDriftSection(driftModules, writer, options, diffCache);
    sections.push({ id: "drift", full: ensureTrailingBlankLine(writer.build()) });
  }

  // Resource changes — one section per module group for granular budget control
  if (modules.length > 0) {
    const writer = new MarkdownWriter();
    writer.heading("Resource Changes", 2);
    sections.push({ id: "resource-changes-heading", full: ensureTrailingBlankLine(writer.build()), fixed: true });

    for (const moduleGroup of modules) {
      const moduleLabel =
        moduleGroup.moduleAddress === ""
          ? "root"
          : `\`${moduleGroup.moduleAddress}\``;

      const mw = new MarkdownWriter();
      mw.heading(`${MODULE_ICON} Module: ${moduleLabel}`, 3);

      for (const resource of moduleGroup.resources) {
        const applyContext = isApply
          ? buildApplyContext(resource.address, failedAddresses, diagByAddress)
          : undefined;
        renderResource(resource, mw, options, diffCache, applyContext);
      }

      if (moduleGroup.outputs.length > 0) {
        mw.heading("Outputs", 4);
        renderOutputTable(moduleGroup.outputs, mw);
      }

      sections.push({
        id: `module-${moduleGroup.moduleAddress || "root"}`,
        full: ensureTrailingBlankLine(mw.build()),
        compact: `### ${MODULE_ICON} Module: ${moduleLabel}\n\n_(details omitted)_\n\n`,
      });
    }
  }

  // Top-level outputs
  if (outputs.length > 0) {
    const writer = new MarkdownWriter();
    writer.heading("Outputs", 2);
    renderOutputTable(outputs, writer);
    sections.push({ id: "outputs", full: ensureTrailingBlankLine(writer.build()) });
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
export function renderReport(report: Report, options: RenderOptions = {}): string {
  return renderStructuredSections(report, options)
    .map((s) => s.full)
    .join("");
}

/** Returns true when the report was produced from an apply run. */
function isApplyReport(report: Report): boolean {
  return report.operation === "apply" || report.operation === "destroy";
}

/** Builds a Set of resource addresses that failed during apply. */
function buildFailedSet(report: Report): Set<string> {
  const failed = new Set<string>();
  if (report.applyStatuses) {
    for (const s of report.applyStatuses) {
      if (!s.success) {
        failed.add(s.address);
      }
    }
  }
  return failed;
}

/** Builds a Map of resource address → diagnostics for that resource. */
function buildDiagnosticMap(report: Report): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  if (report.diagnostics) {
    for (const diag of report.diagnostics) {
      if (diag.address !== undefined) {
        let list = map.get(diag.address);
        if (!list) {
          list = [];
          map.set(diag.address, list);
        }
        list.push(diag);
      }
    }
  }
  return map;
}

/**
 * Extracts diagnostics that are not resource-specific: those without
 * an address, or whose address doesn't match any resource in the report.
 */
function extractNonResourceDiagnostics(
  report: Report,
): Diagnostic[] {
  if (!report.diagnostics) return [];

  const resourceAddresses = new Set(
    (report.modules ?? []).flatMap((m) => m.resources.map((r) => r.address)),
  );

  return report.diagnostics.filter(
    (d) => d.address === undefined || !resourceAddresses.has(d.address),
  );
}

/** Builds an ApplyContext for a given resource address. */
function buildApplyContext(
  address: string,
  failedAddresses: Set<string>,
  diagByAddress: Map<string, Diagnostic[]>,
): ApplyContext {
  return {
    failed: failedAddresses.has(address),
    diagnostics: diagByAddress.get(address) ?? [],
  };
}

function renderOutputTable(
  outputs: readonly OutputChange[],
  writer: MarkdownWriter,
): void {
  writer.tableHeader(["Output", "Action", "Before", "After"]);
  for (const output of outputs) {
    const symbol = ACTION_SYMBOLS[output.action];
    const before = output.isSensitive
      ? MarkdownWriter.inlineCode("(sensitive)")
      : output.before !== null
        ? MarkdownWriter.inlineCode(MarkdownWriter.escapeCell(output.before))
        : "";
    const after = output.isSensitive
      ? MarkdownWriter.inlineCode("(sensitive)")
      : output.after !== null
        ? MarkdownWriter.inlineCode(MarkdownWriter.escapeCell(output.after))
        : "";
    writer.tableRow([
      MarkdownWriter.escapeCell(output.name),
      symbol,
      before,
      after,
    ]);
  }
  writer.blankLine();
}

/**
 * Renders a drift section showing resources whose real-world state has
 * drifted from the prior state file. Uses the same resource rendering
 * as the changes section but under a distinct heading.
 */
function renderDriftSection(
  driftModules: readonly import("../model/module-group.js").ModuleGroup[],
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): void {
  const driftCount = driftModules.reduce(
    (sum, m) => sum + m.resources.length,
    0,
  );
  writer.heading(`${DRIFT_ICON} Resource Drift (${String(driftCount)} detected)`, 2);

  for (const moduleGroup of driftModules) {
    const moduleLabel =
      moduleGroup.moduleAddress === ""
        ? "root"
        : `\`${moduleGroup.moduleAddress}\``;

    writer.heading(`${MODULE_ICON} Module: ${moduleLabel}`, 3);

    for (const resource of moduleGroup.resources) {
      renderResource(resource, writer, options, diffCache);
    }
  }
}
