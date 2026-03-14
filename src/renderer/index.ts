import type { StructuredReport } from "../model/report.js";
import type { RenderOptions } from "./options.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { DiffEntry } from "../diff/types.js";
import { MarkdownWriter } from "./writer.js";
import { renderSummary } from "./summary.js";
import { renderResource } from "./resource.js";
import type { ApplyContext } from "./resource.js";
import { renderDiagnostics } from "./diagnostics.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { MODULE_ICON, DRIFT_ICON } from "../model/status-icons.js";
import { resolveTemplate } from "../template/index.js";

/**
 * Renders a Report model to a markdown string.
 * Automatically detects apply reports (those with diagnostics or applyStatuses)
 * and renders appropriate sections.
 */
export function renderReport(report: StructuredReport, options: RenderOptions = {}): string {
  const template = resolveTemplate(options.template ?? "default");
  const writer = new MarkdownWriter();
  const diffCache = new Map<string, DiffEntry[]>();
  const isApply = isApplyReport(report);
  const summaryHeading = isApply ? "Apply Summary" : "Plan Summary";

  // Build apply context maps
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  const nonResourceDiags = extractNonResourceDiagnostics(report);

  if (options.title) {
    writer.heading(options.title, 2);
  }

  if (template.name === "summary") {
    writer.heading(summaryHeading, 2);
    renderSummary(report.summary, writer, isApply);
    // Summary template: all diagnostics go in top-level section
    if (report.diagnostics !== undefined && report.diagnostics.length > 0) {
      renderDiagnostics(report.diagnostics, writer, 2);
    }
    return writer.build();
  }

  // Default template
  writer.heading(summaryHeading, 2);
  renderSummary(report.summary, writer, isApply);

  // Non-resource diagnostics between summary and resource changes
  if (nonResourceDiags.length > 0) {
    renderDiagnostics(nonResourceDiags, writer, 2);
  }

  // Resource drift section (between summary and resource changes)
  if (report.driftModules.length > 0) {
    renderDriftSection(report, writer, options, diffCache);
  }

  if (report.modules.length > 0 || report.outputs.length > 0) {
    writer.heading("Resource Changes", 2);

    for (const moduleGroup of report.modules) {
      const moduleLabel =
        moduleGroup.moduleAddress === ""
          ? "root"
          : `\`${moduleGroup.moduleAddress}\``;

      writer.heading(`${MODULE_ICON} Module: ${moduleLabel}`, 3);

      for (const resource of moduleGroup.resources) {
        const applyContext = isApply
          ? buildApplyContext(resource.address, failedAddresses, diagByAddress)
          : undefined;
        renderResource(resource, writer, options, diffCache, applyContext);
      }

      if (moduleGroup.outputs.length > 0) {
        writer.heading("Outputs", 4);
        renderOutputTable(moduleGroup.outputs, writer);
      }
    }

    if (report.outputs.length > 0) {
      writer.heading("Outputs", 2);
      renderOutputTable(report.outputs, writer);
    }
  }

  return writer.build();
}

/** Returns true when the report was produced from an apply run. */
function isApplyReport(report: StructuredReport): boolean {
  return (
    report.diagnostics !== undefined || report.applyStatuses !== undefined
  );
}

/** Builds a Set of resource addresses that failed during apply. */
function buildFailedSet(report: StructuredReport): Set<string> {
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
function buildDiagnosticMap(report: StructuredReport): Map<string, Diagnostic[]> {
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
  report: StructuredReport,
): Diagnostic[] {
  if (!report.diagnostics) return [];

  const resourceAddresses = new Set(
    report.modules.flatMap((m) => m.resources.map((r) => r.address)),
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
  outputs: StructuredReport["outputs"],
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
  report: StructuredReport,
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): void {
  const driftCount = report.driftModules.reduce(
    (sum, m) => sum + m.resources.length,
    0,
  );
  writer.heading(`${DRIFT_ICON} Resource Drift (${String(driftCount)} detected)`, 2);

  for (const moduleGroup of report.driftModules) {
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
