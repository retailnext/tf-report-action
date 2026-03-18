/**
 * Raw output formatter — transforms raw command output into markdown.
 *
 * Attempts to detect and format structured output (JSON Lines, validate
 * results). Falls back to a plain code block for unrecognized formats.
 *
 * Analogous to how `diff/` provides diffing algorithms for the renderer,
 * `raw-formatter/` provides raw output transformation algorithms.
 */

import { tryFormatValidateOutput } from "./validate.js";
import { tryFormatJsonLines } from "./jsonl.js";

/**
 * Format raw output content for display. If the content appears to be
 * Terraform/OpenTofu JSON Lines (`@message` envelope), renders it as a
 * human-friendly structured list with level-based icons. If it appears to
 * be a validation result (single JSON object with `diagnostics`), formats
 * the diagnostics. Otherwise falls back to a plain code block.
 */
export function formatRawOutput(content: string): string {
  const trimmed = content.trim();
  if (trimmed === "") return "```\n(empty)\n```";

  // Try single-object validation result first
  const validateResult = tryFormatValidateOutput(trimmed);
  if (validateResult !== undefined) return validateResult;

  // Try JSON Lines format
  const jsonlResult = tryFormatJsonLines(trimmed);
  if (jsonlResult !== undefined) return jsonlResult;

  // Fallback: raw code block (4-backtick fence to avoid conflicts with content)
  return `\`\`\`\`\n${content}\n\`\`\`\``;
}
