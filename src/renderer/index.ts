import type { Report } from "../model/report.js";
import type { ResourceChange } from "../model/resource.js";
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
import { deriveModuleAddress } from "./address.js";

// Re-export address helpers for use by other renderer files and tests
export { deriveModuleAddress, deriveInstanceName } from "./address.js";

// ─── Markdown helpers ──────────────────────────────────────────────────────

/**
 * Lightweight grouping structure used only within the renderer.
 * Not part of the public model — module grouping is a display concern.
 */
interface RendererModuleGroup {
  readonly moduleAddress: string;
  readonly resources: ResourceChange[];
}

/**
 * Groups a flat resource array by derived module address for display.
 * Sorted: root module first, then alphabetical by module address.
 */
function groupByModule(resources: readonly ResourceChange[]): RendererModuleGroup[] {
  const map = new Map<string, ResourceChange[]>();

  for (const resource of resources) {
    const moduleAddr = deriveModuleAddress(resource.address, resource.type);
    let group = map.get(moduleAddr);
    if (!group) {
      group = [];
      map.set(moduleAddr, group);
    }
    group.push(resource);
  }

  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === "") return -1;
      if (b === "") return 1;
      return a.localeCompare(b);
    })
    .map(([moduleAddress, grouped]) => ({ moduleAddress, resources: grouped }));
}

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

// ─── Structured rendering ──────────────────────────────────────────────────

/**
 * Renders a Report's structured body as an array of compositable Sections.
 *
 * Each major part (summary, drift, resource groups, outputs, diagnostics)
 * is a separate Section so the compositor can degrade or omit individual
 * sections under budget pressure.
 *
 * Resources are grouped by module address (derived from each resource's
 * `address` and `type`) for display — this is purely a rendering concern.
 *
 * Requires that the report has `summary` or `resources` populated (i.e.,
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
  const resources = report.resources ?? [];
  const outputs = report.outputs ?? [];
  const driftResources = report.driftResources ?? [];
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
  if (driftResources.length > 0) {
    const writer = new MarkdownWriter();
    renderDriftSection(driftResources, writer, options, diffCache);
    sections.push({ id: "drift", full: ensureTrailingBlankLine(writer.build()) });
  }

  // Resource changes — one section per module group for granular budget control
  const moduleGroups = groupByModule(resources);
  if (moduleGroups.length > 0) {
    const writer = new MarkdownWriter();
    writer.heading("Resource Changes", 2);
    sections.push({ id: "resource-changes-heading", full: ensureTrailingBlankLine(writer.build()), fixed: true });

    for (const moduleGroup of moduleGroups) {
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
    (report.resources ?? []).map((r) => r.address),
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
  driftResources: readonly ResourceChange[],
  writer: MarkdownWriter,
  options: RenderOptions,
  diffCache: Map<string, DiffEntry[]>,
): void {
  writer.heading(`${DRIFT_ICON} Resource Drift (${String(driftResources.length)} detected)`, 2);

  const driftModules = groupByModule(driftResources);
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
