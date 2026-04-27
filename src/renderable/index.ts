/**
 * Format-agnostic renderable primitives.
 *
 * This module provides the core {@link Renderable} interface, primitive
 * renderable classes (Heading, Table, CodeBlock, etc.), and HTML escaping
 * utilities with size estimation. Every piece of report content is a tree
 * of Renderable objects that can render itself to markdown or HTML on demand.
 *
 * **Layer 1** — no project dependencies beyond `model/`.
 */

export { htmlEscape } from "./html-escape.js";
export { markdownEscape } from "./markdown-escape.js";
export {
  renderNote,
  textCell,
  codeSpan,
  boldSpan,
  htmlCodeCell,
  htmlCodeCellMultiline,
  detailsSummary,
} from "./helpers.js";
export {
  Blockquote,
  CodeBlock,
  Details,
  EMPTY,
  Empty,
  Heading,
  InlineDiff,
  Sequence,
  Table,
} from "./primitives.js";
export type { TableRow } from "./primitives.js";
export type {
  ComposedReport,
  OutputFormat,
  Renderable,
  RenderResult,
  ReportElement,
} from "./types.js";
