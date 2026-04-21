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
import {
  Details,
  CodeBlock,
  Paragraph,
  Table,
  Sequence,
  RawText,
  HtmlText,
  EMPTY,
} from "../renderable/primitives.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import {
  STATUS_FAILURE,
  DIAGNOSTIC_ERROR,
  DIAGNOSTIC_WARNING,
} from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";
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
  const symbol = ACTION_SYMBOLS[resource.action];
  return new RawText(`${symbol} ${resource.address}`);
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

  // Build summary text
  const changedAttrs = resource.attributes
    .filter(
      (a) => !a.isSensitive && !a.isKnownAfterApply && a.before !== a.after,
    )
    .map((a) => a.name);

  let summaryHtml = `${symbol} <strong>${htmlEscape(resource.type)}</strong> ${htmlEscape(deriveInstanceName(resource.address, resource.type))}`;

  if (resource.action === "update" && changedAttrs.length > 0) {
    const hint = changedAttrs.slice(0, 5).join(", ");
    summaryHtml += ` — changed: ${htmlEscape(hint)}`;
  }

  if (applyContext?.failed) {
    summaryHtml += ` ${STATUS_FAILURE}`;
  }

  const shouldOpen =
    applyContext !== undefined &&
    (applyContext.failed || applyContext.diagnostics.length > 0);

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
  return new Details(new HtmlText(summaryHtml), content, shouldOpen);
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
    return new Paragraph("_(all values known after apply)_");
  }

  if (resource.attributes.length === 0 && resource.hasAttributeDetail) {
    return new Paragraph("_No attribute changes._");
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
      new RawText("Attribute"),
      new RawText("Before"),
      new RawText("After"),
    ];
    const rows: { cells: Renderable[] }[] = [];

    for (const attr of smallAttrs) {
      const skipDiff = attr.isSensitive || attr.isKnownAfterApply;
      const beforeCell = skipDiff
        ? new HtmlText(inlineCodeCell(attr.before ?? ""))
        : new HtmlText(
            `<code>${escapeHtmlCell(attr.before ?? "").replace(/\n/g, "<br>")}</code>`,
          );
      const afterCell =
        skipDiff || !useCharDiff
          ? new HtmlText(inlineCodeCell(attr.after ?? ""))
          : buildInlineDiff(attr.before, attr.after, diffFormat);
      rows.push({
        cells: [
          new HtmlText(escapeCell(htmlEscape(attr.name))),
          beforeCell,
          afterCell,
        ],
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
    const prefix =
      diag.severity === "error" ? DIAGNOSTIC_ERROR : DIAGNOSTIC_WARNING;
    parts.push(new DiagLine(`${prefix} **${htmlEscape(diag.summary)}**`));
    if (diag.detail) {
      parts.push(new CodeBlock(diag.detail));
    }
  }

  return new Sequence(parts);
}

// ---------------------------------------------------------------------------
// Internal helper renderables
// ---------------------------------------------------------------------------

/** Bold-label + inline code paragraph. */
class MetadataParagraph implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(label: string, value: string) {
    this.mdStr = `**${label}:** \`${value}\`\n\n`;
    this.htStr = `<p><strong>${label}:</strong> <code>${htmlEscape(value)}</code></p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

/** Diagnostic line (paragraph with markdown formatting). */
class DiagLine implements Renderable {
  private readonly mdStr: string;
  private readonly htStr: string;

  constructor(text: string) {
    this.mdStr = `${text}\n\n`;
    this.htStr = `<p>${text}</p>\n`;
  }

  size(format: OutputFormat): number {
    return format === "markdown" ? this.mdStr.length : this.htStr.length;
  }

  render(format: OutputFormat): string {
    return format === "markdown" ? this.mdStr : this.htStr;
  }
}

// ---------------------------------------------------------------------------
// Escape helpers (local copies to avoid importing from renderer/writer)
// ---------------------------------------------------------------------------

/** Escape pipe characters for markdown table cells. */
function escapeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

/** Escape HTML + pipe for table cell context. */
function escapeHtmlCell(value: string): string {
  return htmlEscape(value).replace(/\|/g, "&#124;");
}

/** Wrap value in `<code>` with HTML + pipe escaping. */
function inlineCodeCell(value: string): string {
  return `<code>${htmlEscape(value).replace(/\|/g, "&#124;")}</code>`;
}
