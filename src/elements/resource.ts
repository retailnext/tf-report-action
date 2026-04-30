/**
 * Resource element — renders a single resource change as a collapsible
 * details block at various detail levels.
 *
 * 5 levels (mapping to tiers 1–5):
 * - Level 0 (listing): single line `emoji address` (flat, no details)
 * - Level 1 (compact): summary + address + import/moved + diagnostics
 * - Level 2 (attrs-no-diff): + attribute table without char-level diffs
 * - Level 3 (attrs-char-diff): + attribute table with char-level diffs
 * - Level 4 (full): + full large-value blocks
 *
 * Note: Level 0 is used only by the category listing element, not by
 * module-group rendering.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { ResourceChange } from "../model/resource.js";
import type { Diagnostic } from "../model/diagnostic.js";
import type { DiffEntry } from "../diff/types.js";
import type { ApplyContext } from "./apply-context.js";
import type { DiffFormat } from "./diff-value.js";
import type { PlanAction } from "../model/plan-action.js";
import {
  Details,
  CodeBlock,
  Table,
  Sequence,
  EMPTY,
} from "../renderable/primitives.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import {
  STATUS_FAILURE,
  DIAGNOSTIC_ERROR,
  DIAGNOSTIC_WARNING,
} from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";
import { markdownEscape } from "../renderable/markdown-escape.js";
import { mdCodeSpan } from "../renderable/helpers.js";
import { renderNote } from "../renderable/helpers.js";
import {
  textCell,
  htmlCodeCell,
  htmlCodeCellMultiline,
} from "../renderable/helpers.js";
import { deriveInstanceName } from "./address.js";
import {
  buildInlineDiff,
  buildLargeValueDiff,
  buildLargeValueContextDiff,
} from "./diff-value.js";

/**
 * Options for building resource renderables.
 */
export interface ResourceRenderOptions {
  readonly diffFormat?: DiffFormat | undefined;
  readonly showUnchangedAttributes?: boolean | undefined;
}

/**
 * Builds a Renderable for a single resource at a specific detail level.
 *
 * This is a factory function, not a class — the caller (module-group or
 * category element) decides which levels to build.
 */
export function buildResourceRenderable(
  resource: ResourceChange,
  options: ResourceRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  level: number,
  applyContext?: ApplyContext,
): Renderable {
  if (level === 0) {
    return buildListingLine(resource);
  }

  return buildDetailsRenderable(
    resource,
    options,
    diffCache,
    level,
    applyContext,
  );
}

/** Level 0: a single line for the flat listing. */
function buildListingLine(resource: ResourceChange): Renderable {
  return new ResourceListingLine(resource.action, resource.address);
}

/** Levels 1–4: collapsible details block. */
function buildDetailsRenderable(
  resource: ResourceChange,
  options: ResourceRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  level: number,
  applyContext?: ApplyContext,
): Renderable {
  const symbol = ACTION_SYMBOLS[resource.action];
  const instanceName = deriveInstanceName(resource.address, resource.type);

  // Build changed attributes hint for summary
  const changedAttrs = resource.attributes
    .filter(
      (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after,
    )
    .map((a) => a.name);

  const shouldOpen =
    applyContext !== undefined &&
    (applyContext.failed || applyContext.diagnostics.length > 0);

  // Build the summary Renderable for the Details block
  const summary = new ResourceDetailSummary(
    symbol,
    resource.type,
    instanceName,
    resource.action === "update" ? changedAttrs : [],
    applyContext?.failed ?? false,
  );

  // Build content parts
  const parts: Renderable[] = [];

  // Address code block
  parts.push(new CodeBlock(resource.address));

  // Import/moved metadata
  if (resource.importId !== null) {
    parts.push(new MetadataParagraph("Import ID", resource.importId));
  }
  if (resource.movedFromAddress !== null) {
    parts.push(new MetadataParagraph("Moved from", resource.movedFromAddress));
  }

  // Attributes (levels 2–4 only)
  if (level >= 2) {
    const attrRenderable = buildAttributeRenderable(
      resource,
      options,
      diffCache,
      level,
    );
    if (attrRenderable !== EMPTY) {
      parts.push(attrRenderable);
    }
  }

  // Inline diagnostics
  if (applyContext && applyContext.diagnostics.length > 0) {
    parts.push(buildInlineDiagnostics(applyContext.diagnostics));
  }

  const content = new Sequence(parts);
  return new Details(summary, content, shouldOpen);
}

/** Builds attribute table and large value blocks. */
function buildAttributeRenderable(
  resource: ResourceChange,
  options: ResourceRenderOptions,
  diffCache: Map<string, DiffEntry[]>,
  level: number,
): Renderable {
  const diffFormat = options.diffFormat ?? "inline";
  const useCharDiff = level >= 3;

  if (resource.allUnknownAfterApply) {
    return new NoteRenderable("all values known after apply");
  }

  if (resource.attributes.length === 0 && resource.hasAttributeDetail) {
    return new NoteRenderable("No attribute changes.");
  }

  if (resource.attributes.length === 0) {
    return EMPTY;
  }

  const parts: Renderable[] = [];
  const smallAttrs = resource.attributes.filter((a) => !a.isLarge);
  const largeAttrs = resource.attributes.filter((a) => a.isLarge);

  // Small attributes table
  if (smallAttrs.length > 0) {
    const headers = [
      textCell("Attribute"),
      textCell("Before"),
      textCell("After"),
    ];
    const rows: { cells: Renderable[] }[] = [];

    for (const attr of smallAttrs) {
      const skipDiff = attr.isSensitive || attr.isKnownAfterApply;
      const beforeCell = skipDiff
        ? htmlCodeCell(attr.before ?? "")
        : htmlCodeCellMultiline(attr.before ?? "");
      const afterCell =
        skipDiff || !useCharDiff
          ? htmlCodeCell(attr.after ?? "")
          : buildInlineDiff(attr.before, attr.after, diffFormat);
      rows.push({
        cells: [textCell(attr.name), beforeCell, afterCell],
      });
    }

    parts.push(new Table(headers, rows));
  }

  // Large attributes as collapsibles
  for (const attr of largeAttrs) {
    const block =
      level === 4
        ? buildLargeValueDiff(attr.name, attr.before, attr.after, diffCache)
        : buildLargeValueContextDiff(
            attr.name,
            attr.before,
            attr.after,
            diffCache,
          );
    if (block !== EMPTY) {
      parts.push(block);
    }
  }

  if (parts.length === 0) return EMPTY;
  return new Sequence(parts);
}

/** Builds inline diagnostics for a resource. */
function buildInlineDiagnostics(
  diagnostics: readonly Diagnostic[],
): Renderable {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const parts: Renderable[] = [];

  for (const diag of [...errors, ...warnings]) {
    parts.push(new ResourceDiagnosticLine(diag.severity, diag.summary));
    if (diag.detail) {
      parts.push(new CodeBlock(diag.detail));
    }
  }

  return new Sequence(parts);
}

// ---------------------------------------------------------------------------
// Internal helper renderables
// ---------------------------------------------------------------------------

/**
 * Resource listing line — renders `symbol address` for flat listings.
 * Stores action and address as semantic data; escapes at render time.
 */
class ResourceListingLine implements Renderable {
  private readonly action: PlanAction;
  private readonly address: string;

  constructor(action: PlanAction, address: string) {
    this.action = action;
    this.address = address;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const symbol = ACTION_SYMBOLS[this.action];
    if (format === "markdown") {
      return `${symbol} ${markdownEscape(this.address)}`;
    }
    return `${symbol} ${htmlEscape(this.address)}`;
  }
}

/**
 * Resource detail summary — renders the `<summary>` content for a
 * resource's collapsible details block. Always produces HTML since
 * `<summary>` is an HTML context in both formats.
 */
class ResourceDetailSummary implements Renderable {
  private readonly symbol: string;
  private readonly type: string;
  private readonly instanceName: string;
  private readonly changedAttrs: readonly string[];
  private readonly failed: boolean;

  constructor(
    symbol: string,
    type: string,
    instanceName: string,
    changedAttrs: readonly string[],
    failed: boolean,
  ) {
    this.symbol = symbol;
    this.type = type;
    this.instanceName = instanceName;
    this.changedAttrs = changedAttrs;
    this.failed = failed;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    let html = `${this.symbol} <strong>${htmlEscape(this.type)}</strong> ${htmlEscape(this.instanceName)}`;

    if (this.changedAttrs.length > 0) {
      const hint = this.changedAttrs.slice(0, 5).join(", ");
      html += ` — changed: ${htmlEscape(hint)}`;
    }

    if (this.failed) {
      html += ` ${STATUS_FAILURE}`;
    }

    return html;
  }
}

/** Bold-label + inline code paragraph. */
class MetadataParagraph implements Renderable {
  private readonly label: string;
  private readonly value: string;

  constructor(label: string, value: string) {
    this.label = label;
    this.value = value;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return `**${markdownEscape(this.label)}:** ${mdCodeSpan(this.value)}\n\n`;
    }
    return `<p><strong>${htmlEscape(this.label)}:</strong> <code>${htmlEscape(this.value)}</code></p>\n`;
  }
}

/**
 * Resource diagnostic line — holds severity and summary text as
 * semantic data; renders bold summary with icon per format.
 */
class ResourceDiagnosticLine implements Renderable {
  private readonly severity: "error" | "warning";
  private readonly summary: string;

  constructor(severity: "error" | "warning", summary: string) {
    this.severity = severity;
    this.summary = summary;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const icon =
      this.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    if (format === "markdown") {
      return `${icon} **${markdownEscape(this.summary)}**\n\n`;
    }
    return `<p>${icon} <strong>${htmlEscape(this.summary)}</strong></p>\n`;
  }
}

/** Contextual note — italic in markdown, `<em>` in HTML. */
class NoteRenderable implements Renderable {
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  size(format: OutputFormat): number {
    return renderNote(this.text, format).length;
  }

  render(format: OutputFormat): string {
    return renderNote(this.text, format);
  }
}
