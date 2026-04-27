/**
 * Raw output formatting — transforms raw command output into Renderables.
 *
 * Attempts to detect and format structured output (JSON Lines, validate
 * results). Falls back to a plain code block for unrecognized formats.
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import { CodeBlock } from "../renderable/primitives.js";
import {
  DIAGNOSTIC_WARNING,
  DIAGNOSTIC_ERROR,
  STATUS_SUCCESS,
  STATUS_FAILURE,
} from "../model/status-icons.js";
import { htmlEscape } from "../renderable/html-escape.js";

// ---------------------------------------------------------------------------
// JSON Lines types and helpers
// ---------------------------------------------------------------------------

/** Parsed JSON Lines message with known envelope fields. */
interface JsonLinesMsg {
  "@level"?: string;
  "@message"?: string;
  "@module"?: string;
  "@timestamp"?: string;
  type?: string;
  [key: string]: unknown;
}

/** Envelope keys excluded when flattening extra fields. */
const ENVELOPE_KEYS = new Set([
  "@level",
  "@message",
  "@module",
  "@timestamp",
  "type",
]);

/**
 * Dot-flatten a JSON value into sorted `key=value` pairs.
 * Nested objects produce dotted keys. Long values (>80 chars) are truncated.
 */
function flattenJsonFields(
  obj: Record<string, unknown>,
  skipKeys: Set<string>,
): string[] {
  const pairs: [string, string][] = [];

  function walk(value: unknown, prefix: string): void {
    if (value === null || value === undefined) {
      pairs.push([prefix, String(value)]);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        walk(record[key], prefix ? `${prefix}.${key}` : key);
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        walk(value[i], `${prefix}.${String(i)}`);
      }
    } else {
      let str = typeof value === "string" ? value : JSON.stringify(value);
      if (str.length > 80) {
        str = str.slice(0, 77) + "...";
      }
      pairs.push([prefix, str]);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    walk(value, key);
  }

  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return pairs.map(([k, v]) => `\`${k}=${v}\``);
}

/** Return the appropriate icon for a JSON Lines @level value. */
function levelIcon(level: string): string {
  switch (level) {
    case "error":
      return DIAGNOSTIC_ERROR;
    case "warn":
      return DIAGNOSTIC_WARNING;
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a Renderable from raw command output content.
 *
 * If the content appears to be Terraform/OpenTofu JSON Lines (`@message`
 * envelope), renders it as a human-friendly structured list with level-based
 * icons. If it appears to be a validation result (single JSON object with
 * `diagnostics`), formats the diagnostics. Otherwise falls back to a plain
 * code block.
 */
export function buildRawOutputRenderable(content: string): Renderable {
  const trimmed = content.trim();
  if (trimmed === "") return new CodeBlock("(empty)");

  // Try single-object validation result first
  const validateResult = tryBuildValidateRenderable(trimmed, content);
  if (validateResult !== undefined) return validateResult;

  // Try JSON Lines format
  const jsonlResult = tryBuildJsonLinesRenderable(trimmed);
  if (jsonlResult !== undefined) return jsonlResult;

  // Fallback: raw code block (4-backtick fence to avoid conflicts with content)
  return new FourTickCodeBlock(content);
}

// ---------------------------------------------------------------------------
// Validate output
// ---------------------------------------------------------------------------

/** Try to parse as a validation result and build a Renderable. */
function tryBuildValidateRenderable(
  trimmed: string,
  raw: string,
): Renderable | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const obj = parsed as Record<string, unknown>;
  if (
    !("valid" in obj) ||
    typeof obj["valid"] !== "boolean" ||
    !("diagnostics" in obj) ||
    !Array.isArray(obj["diagnostics"])
  ) {
    return undefined;
  }

  const valid = obj["valid"];
  const diagnostics = obj["diagnostics"].filter(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && !Array.isArray(d),
  );

  return new ValidateRenderable(valid, diagnostics, raw);
}

// ---------------------------------------------------------------------------
// JSON Lines
// ---------------------------------------------------------------------------

/** Try to parse as JSON Lines and build a Renderable. */
function tryBuildJsonLinesRenderable(content: string): Renderable | undefined {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return undefined;

  const messages: JsonLinesMsg[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return undefined;
      }
      messages.push(parsed as JsonLinesMsg);
    } catch {
      return undefined;
    }
  }

  if (!messages.some((m) => typeof m["@message"] === "string")) {
    return undefined;
  }

  return new JsonLinesRenderable(messages);
}

// ---------------------------------------------------------------------------
// Internal renderables
// ---------------------------------------------------------------------------

/** A code block with 4-backtick fences. */
class FourTickCodeBlock implements Renderable {
  private readonly content: string;

  constructor(content: string) {
    this.content = content;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return `\`\`\`\`\n${this.content}\n\`\`\`\`\n\n`;
    }
    return `<pre><code>${htmlEscape(this.content)}</code></pre>\n`;
  }
}

/** Validation result renderable. */
class ValidateRenderable implements Renderable {
  private readonly valid: boolean;
  private readonly diagnostics: Record<string, unknown>[];
  private readonly raw: string;

  constructor(
    valid: boolean,
    diagnostics: Record<string, unknown>[],
    raw: string,
  ) {
    this.valid = valid;
    this.diagnostics = diagnostics;
    this.raw = raw;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return buildValidateMarkdown(this.valid, this.diagnostics, this.raw);
    }
    return buildValidateHtml(this.valid, this.diagnostics, this.raw);
  }
}

function buildValidateMarkdown(
  valid: boolean,
  diagnostics: Record<string, unknown>[],
  raw: string,
): string {
  let output = "";
  if (valid) {
    output += `${STATUS_SUCCESS} Configuration is valid\n\n`;
  } else {
    output += `${STATUS_FAILURE} Configuration is **invalid**\n\n`;
  }

  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      output += formatValidateDiagMarkdown(diag);
    }
  }

  output += `<details>\n<summary>Show raw JSON</summary>\n\n\`\`\`json\n${raw}\n\`\`\`\n\n</details>\n\n`;
  return output;
}

function buildValidateHtml(
  valid: boolean,
  diagnostics: Record<string, unknown>[],
  raw: string,
): string {
  let output = "";
  if (valid) {
    output += `<p>${STATUS_SUCCESS} Configuration is valid</p>\n`;
  } else {
    output += `<p>${STATUS_FAILURE} Configuration is <strong>invalid</strong></p>\n`;
  }

  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      output += formatValidateDiagHtml(diag);
    }
  }

  output += `<details>\n<summary>Show raw JSON</summary>\n<pre><code class="language-json">${htmlEscape(raw)}</code></pre>\n</details>\n`;
  return output;
}

function formatValidateDiagMarkdown(diag: Record<string, unknown>): string {
  const severity =
    typeof diag["severity"] === "string" ? diag["severity"] : "error";
  const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
  const summary =
    typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
  const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";

  let output = `${icon} **${htmlEscape(summary)}**\n`;
  if (detail) {
    const detailLines = htmlEscape(detail)
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    output += `${detailLines}\n\n`;
  }

  const snippet = diag["snippet"] as Record<string, unknown> | undefined;
  if (snippet && typeof snippet["code"] === "string") {
    const lineInfo =
      typeof snippet["start_line"] === "number"
        ? ` (line ${String(snippet["start_line"])})`
        : "";
    const ctx =
      typeof snippet["context"] === "string"
        ? ` in ${htmlEscape(snippet["context"])}`
        : "";
    output += `> \`${snippet["code"]}\`${ctx}${lineInfo}\n`;
  }
  output += "\n";
  return output;
}

function formatValidateDiagHtml(diag: Record<string, unknown>): string {
  const severity =
    typeof diag["severity"] === "string" ? diag["severity"] : "error";
  const icon = severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
  const summary =
    typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
  const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";

  let output = `<p>${icon} <strong>${htmlEscape(summary)}</strong></p>\n`;
  if (detail) {
    output += `<blockquote><p>${htmlEscape(detail)}</p></blockquote>\n`;
  }

  const snippet = diag["snippet"] as Record<string, unknown> | undefined;
  if (snippet && typeof snippet["code"] === "string") {
    const lineInfo =
      typeof snippet["start_line"] === "number"
        ? ` (line ${String(snippet["start_line"])})`
        : "";
    const ctx =
      typeof snippet["context"] === "string"
        ? ` in ${htmlEscape(snippet["context"])}`
        : "";
    output += `<blockquote><p><code>${htmlEscape(snippet["code"])}</code>${ctx}${lineInfo}</p></blockquote>\n`;
  }
  return output;
}

/** JSON Lines renderable — formats messages with icons and expandable fields. */
class JsonLinesRenderable implements Renderable {
  private readonly messages: JsonLinesMsg[];

  constructor(messages: JsonLinesMsg[]) {
    this.messages = messages;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    if (format === "markdown") {
      return buildJsonLinesMarkdown(this.messages);
    }
    return buildJsonLinesHtml(this.messages);
  }
}

function buildJsonLinesMarkdown(messages: JsonLinesMsg[]): string {
  const infoAndAbove: JsonLinesMsg[] = [];
  const debugTrace: JsonLinesMsg[] = [];

  for (const msg of messages) {
    const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
    if (level === "trace" || level === "debug") {
      debugTrace.push(msg);
    } else {
      infoAndAbove.push(msg);
    }
  }

  const parts: string[] = [];

  for (const msg of infoAndAbove) {
    parts.push(formatJsonLinesMsgMarkdown(msg));
  }

  if (debugTrace.length > 0) {
    const counts = new Map<string, number>();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(
      ([l, c]) => `${String(c)} ${l}`,
    );
    const inner = debugTrace
      .map((msg) => {
        const message =
          typeof msg["@message"] === "string"
            ? msg["@message"]
            : "(no message)";
        return `\`${message}\``;
      })
      .join("\n\n");
    parts.push(
      `<details>\n<summary>${countParts.join(", ")} message(s) omitted</summary>\n<br>\n\n${inner}\n\n</details>`,
    );
  }

  return parts.join("\n\n") + "\n\n";
}

function formatJsonLinesMsgMarkdown(msg: JsonLinesMsg): string {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message =
    typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";

  const fields = flattenJsonFields(
    msg as Record<string, unknown>,
    ENVELOPE_KEYS,
  );

  if (fields.length === 0) {
    const typeSuffix = typeStr ? ` \`type=${typeStr}\`` : "";
    return `${prefix}\`${message}\`${typeSuffix}`;
  }

  const escapedMsg = htmlEscape(message);
  const typeSuffix = typeStr ? ` <code>type=${htmlEscape(typeStr)}</code>` : "";
  const fieldLines = fields.join("\n\n");
  return `<details>\n<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>\n<br>\n\n${fieldLines}\n\n</details>`;
}

function buildJsonLinesHtml(messages: JsonLinesMsg[]): string {
  const infoAndAbove: JsonLinesMsg[] = [];
  const debugTrace: JsonLinesMsg[] = [];

  for (const msg of messages) {
    const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
    if (level === "trace" || level === "debug") {
      debugTrace.push(msg);
    } else {
      infoAndAbove.push(msg);
    }
  }

  const parts: string[] = [];

  for (const msg of infoAndAbove) {
    parts.push(formatJsonLinesMsgHtml(msg));
  }

  if (debugTrace.length > 0) {
    const counts = new Map<string, number>();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(
      ([l, c]) => `${String(c)} ${l}`,
    );
    const inner = debugTrace
      .map((msg) => {
        const message =
          typeof msg["@message"] === "string"
            ? msg["@message"]
            : "(no message)";
        return `<p><code>${htmlEscape(message)}</code></p>`;
      })
      .join("\n");
    parts.push(
      `<details>\n<summary>${countParts.join(", ")} message(s) omitted</summary>\n${inner}\n</details>`,
    );
  }

  return parts.join("\n") + "\n";
}

function formatJsonLinesMsgHtml(msg: JsonLinesMsg): string {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message =
    typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";

  const fields = flattenJsonFields(
    msg as Record<string, unknown>,
    ENVELOPE_KEYS,
  );

  if (fields.length === 0) {
    const typeSuffix = typeStr
      ? ` <code>type=${htmlEscape(typeStr)}</code>`
      : "";
    return `<p>${prefix}<code>${htmlEscape(message)}</code>${typeSuffix}</p>`;
  }

  const escapedMsg = htmlEscape(message);
  const typeSuffix = typeStr ? ` <code>type=${htmlEscape(typeStr)}</code>` : "";
  const fieldEntries = fields.map((f) => `<p>${f}</p>`).join("\n");
  return `<details>\n<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>\n${fieldEntries}\n</details>`;
}
