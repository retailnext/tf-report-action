import type { UIMessage } from "../tfjson/machine-readable-ui.js";

/**
 * Parses a JSON Lines string (one JSON object per line) from the machine-readable
 * UI output of `terraform` or `tofu` commands run with the `-json` flag.
 *
 * Blank lines and lines containing only whitespace are silently skipped. Each
 * non-blank line must be a valid JSON object with a `type` string field; lines
 * that fail to parse or lack a `type` field cause a descriptive error.
 *
 * Unknown `type` values are preserved as `UIUnknownMessage` (the discriminated
 * union's catch-all), ensuring forward compatibility with future message types.
 *
 * Error messages never include raw line content (which may contain sensitive
 * plan attribute values).
 */
export function parseUILog(jsonl: string): UIMessage[] {
  const lines = jsonl.split("\n");
  const messages: UIMessage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (line === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw new Error(
        `Failed to parse UI log line ${String(i + 1)}: not valid JSON`,
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(
        `UI log line ${String(i + 1)} is not a JSON object`,
      );
    }

    const obj = parsed as Record<string, unknown>;
    if (typeof obj["type"] !== "string") {
      throw new Error(
        `UI log line ${String(i + 1)} is missing required field: type`,
      );
    }

    messages.push(parsed as UIMessage);
  }

  return messages;
}
