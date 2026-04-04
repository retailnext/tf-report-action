/**
 * Tier-1 flat listing renderer.
 *
 * Produces the most compact representation of a category's content:
 * a single fenced code block with one `emoji address` line per item.
 * Used as the baseline tier in progressive enhancement — every resource
 * is at least listed before any attribute diffs are shown.
 */

import type { ResourceChange } from "../model/resource.js";
import type { OutputChange } from "../model/output.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";

/**
 * Renders a flat listing of resource changes as a fenced code block.
 *
 * Each line is `emoji full-address`. If `maxItems` is exceeded, the
 * listing is truncated with a count of omitted items.
 *
 * @param heading - Section heading (e.g. "Resource Changes")
 * @param resources - Flat array of resource changes
 * @param maxItems - Maximum number of items to list before truncating
 * @returns Markdown string with heading and fenced listing
 */
export function renderResourceListing(
  heading: string,
  resources: readonly ResourceChange[],
  maxItems?: number,
): string {
  const lines = resources.map(
    (r) => `${ACTION_SYMBOLS[r.action]} ${r.address}`,
  );
  return buildListing(heading, lines, maxItems);
}

/**
 * Renders a flat listing of output changes as a fenced code block.
 *
 * Each line is `emoji name`. Sensitive outputs are marked.
 *
 * @param heading - Section heading (e.g. "Output Changes")
 * @param outputs - Array of output changes
 * @param maxItems - Maximum number of items to list before truncating
 * @returns Markdown string with heading and fenced listing
 */
export function renderOutputListing(
  heading: string,
  outputs: readonly OutputChange[],
  maxItems?: number,
): string {
  const lines = outputs.map((o) => `${ACTION_SYMBOLS[o.action]} ${o.name}`);
  return buildListing(heading, lines, maxItems);
}

/**
 * Builds a fenced-code listing with optional truncation.
 *
 * @param heading - Markdown heading text
 * @param lines - Pre-formatted lines to include
 * @param maxItems - If set and lines exceeds this, truncate with a count
 * @returns Complete markdown string (heading + code block)
 */
function buildListing(
  heading: string,
  lines: string[],
  maxItems?: number,
): string {
  const parts: string[] = [];
  parts.push(`## ${heading}\n`);

  const limit = maxItems ?? lines.length;
  const shown = lines.slice(0, limit);
  const omitted = lines.length - shown.length;

  parts.push("```");
  parts.push(shown.join("\n"));
  if (omitted > 0) {
    parts.push(`... and ${String(omitted)} more`);
  }
  parts.push("```\n");

  return parts.join("\n");
}
