/**
 * JSON Lines formatting for Terraform/OpenTofu machine-readable output.
 *
 * Renders JSON Lines messages in a pretty-json-log style with level-based
 * icons, expandable field details, and debug/trace message collapsing.
 */

import { DIAGNOSTIC_WARNING, DIAGNOSTIC_ERROR } from "../model/status-icons.js";

/** Parsed JSON Lines message with known envelope fields. */
export interface JsonLinesMsg {
  "@level"?: string;
  "@message"?: string;
  "@module"?: string;
  "@timestamp"?: string;
  type?: string;
  [key: string]: unknown;
}

/** Envelope keys excluded when flattening extra fields. */
const ENVELOPE_KEYS = new Set(["@level", "@message", "@module", "@timestamp", "type"]);

/**
 * Dot-flatten a JSON value into sorted `key=value` pairs.
 *
 * Nested objects produce dotted keys (`hook.resource.addr`).
 * Arrays produce indexed keys (`items.0`, `items.1`).
 * Scalar values are stringified; long values (>80 chars) are truncated.
 */
export function flattenJsonFields(
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

/**
 * Escape characters that have special meaning in HTML.
 * Used for text placed inside HTML tags like `<code>` within `<summary>`.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Return the appropriate icon for a JSON Lines @level value. */
export function levelIcon(level: string): string {
  switch (level) {
    case "error": return DIAGNOSTIC_ERROR;
    case "warn": return DIAGNOSTIC_WARNING;
    default: return "";
  }
}

/**
 * Format a single JSON Lines message in pretty-json-log style.
 *
 * Messages with extra fields beyond the envelope are wrapped in a
 * `<details>` block so the fields can be expanded. Inside `<summary>`,
 * `<code>` tags are used because GitHub does not render backtick markdown
 * within `<summary>` elements. Messages without extra fields render as
 * plain backtick-wrapped paragraphs (where markdown works normally).
 */
export function formatJsonLinesMessage(msg: JsonLinesMsg): string {
  const level = typeof msg["@level"] === "string" ? msg["@level"] : "info";
  const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
  const icon = levelIcon(level);
  const prefix = icon ? `${icon} ` : "";
  const typeStr = typeof msg.type === "string" ? msg.type : "";

  const fields = flattenJsonFields(msg as Record<string, unknown>, ENVELOPE_KEYS);

  if (fields.length === 0) {
    const typeSuffix = typeStr ? ` \`type=${typeStr}\`` : "";
    return `${prefix}\`${message}\`${typeSuffix}`;
  }

  // Inside <summary>, markdown backticks don't render — use <code> tags
  const escapedMsg = escapeHtml(message);
  const typeSuffix = typeStr ? ` <code>type=${escapeHtml(typeStr)}</code>` : "";
  const fieldLines = fields.join("\n\n");
  return `<details>\n<summary>${prefix}<code>${escapedMsg}</code>${typeSuffix}</summary>\n<br>\n\n${fieldLines}\n\n</details>`;
}

/**
 * Try to parse content as Terraform/OpenTofu JSON Lines and format it.
 * Returns undefined if the content is not valid JSON Lines with `@message`.
 *
 * Each message renders as a backtick-wrapped paragraph with a `type=X` suffix.
 * Messages with extra fields beyond the envelope are expandable via `<details>`.
 * Fields are dot-flattened, sorted lexicographically, one per line.
 */
export function tryFormatJsonLines(content: string): string | undefined {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return undefined;

  const messages: JsonLinesMsg[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return undefined;
      }
      messages.push(parsed as JsonLinesMsg);
    } catch {
      return undefined;
    }
  }

  // Require that at least one message has @message to identify as JSON Lines
  if (!messages.some((m) => typeof m["@message"] === "string")) {
    return undefined;
  }

  // Categorize messages by level for display
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
    parts.push(formatJsonLinesMessage(msg));
  }

  // Show debug/trace summary if any exist
  if (debugTrace.length > 0) {
    const counts = new Map<string, number>();
    for (const msg of debugTrace) {
      const level = typeof msg["@level"] === "string" ? msg["@level"] : "debug";
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    const countParts = [...counts.entries()].map(([l, c]) => `${String(c)} ${l}`);
    const inner = debugTrace
      .map((msg) => {
        const message = typeof msg["@message"] === "string" ? msg["@message"] : "(no message)";
        return `\`${message}\``;
      })
      .join("\n\n");
    parts.push(`<details>\n<summary>${countParts.join(", ")} message(s) omitted</summary>\n<br>\n\n${inner}\n\n</details>`);
  }

  return parts.join("\n\n") + "\n";
}
