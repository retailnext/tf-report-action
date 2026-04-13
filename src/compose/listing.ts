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
 * Each line is `emoji full-address`. If `maxLength` is exceeded, the
 * listing is truncated with a count of omitted items.
 *
 * @param heading - Section heading (e.g. "Resource Changes")
 * @param resources - Flat array of resource changes
 * @param maxLength - Maximum character budget; listing is truncated to fit
 * @returns Markdown string with heading and fenced listing
 */
export function renderResourceListing(
  heading: string,
  resources: readonly ResourceChange[],
  maxLength?: number,
): string {
  const lines = resources.map(
    (r) => `${ACTION_SYMBOLS[r.action]} ${r.address}`,
  );
  return buildListing(heading, lines, maxLength);
}

/**
 * Renders a flat listing of output changes as a fenced code block.
 *
 * Each line is `emoji name`. Sensitive outputs are marked with ` (sensitive)`.
 *
 * @param heading - Section heading (e.g. "Output Changes")
 * @param outputs - Array of output changes
 * @param maxLength - Maximum character budget; listing is truncated to fit
 * @returns Markdown string with heading and fenced listing
 */
export function renderOutputListing(
  heading: string,
  outputs: readonly OutputChange[],
  maxLength?: number,
): string {
  const lines = outputs.map((o) => {
    const suffix = o.isSensitive ? " (sensitive)" : "";
    return `${ACTION_SYMBOLS[o.action]} ${o.name}${suffix}`;
  });
  return buildListing(heading, lines, maxLength);
}

/**
 * Builds a fenced-code listing with optional character-budget truncation.
 *
 * @param heading - Markdown heading text
 * @param lines - Pre-formatted lines to include
 * @param maxLength - If set, emit lines until adding the next would exceed this budget
 * @returns Complete markdown string (heading + code block)
 */
function buildListing(
  heading: string,
  lines: string[],
  maxLength?: number,
): string {
  const headerLine = `## ${heading}\n`;
  const fenceOpen = "```\n";
  const fenceClose = "\n```\n";

  if (maxLength === undefined) {
    return headerLine + fenceOpen + lines.join("\n") + fenceClose;
  }

  // Calculate fixed overhead
  const overhead = headerLine.length + fenceOpen.length + fenceClose.length;
  let remaining = maxLength - overhead;
  const shown: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    // Account for the newline separator between lines
    const lineLen = shown.length > 0 ? line.length + 1 : line.length;

    // Reserve space for the "... and N more" suffix if there are more items
    const moreItems = lines.length - (i + 1);
    const omittedSuffix =
      moreItems > 0 ? `\n... and ${String(moreItems)} more` : "";
    const neededForRest = omittedSuffix.length;

    if (lineLen + neededForRest <= remaining) {
      shown.push(line);
      remaining -= lineLen;
    } else {
      // Can't fit this line; emit omitted count for all remaining
      const totalOmitted = lines.length - shown.length;
      if (totalOmitted > 0) {
        shown.push(`... and ${String(totalOmitted)} more`);
      }
      break;
    }
  }

  return headerLine + fenceOpen + shown.join("\n") + fenceClose;
}
