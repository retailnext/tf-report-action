/**
 * Detects whether a sequence of lines is JSON Lines output from an
 * OpenTofu/Terraform `-json` command.
 *
 * Used by tier detection to distinguish structured JSONL (scannable) from
 * plaintext (shown as raw content). Operates on the first few lines only,
 * so the caller need not read the entire file.
 *
 * @module jsonl-scanner/detect
 */

/**
 * Checks whether the given lines look like JSON Lines from an
 * OpenTofu/Terraform command.
 *
 * A stream is considered JSONL if at least one of the first few non-empty
 * lines is a JSON object with a string `type` field. This is deliberately
 * lenient — even a partially corrupted JSONL stream (e.g. a few garbage
 * lines followed by valid messages) will be detected, because the scanner
 * tolerates and counts bad lines.
 *
 * @param firstLines - The first few lines of the file/string (typically 5–10).
 *                     Empty/whitespace-only lines are skipped.
 * @returns `true` if the content appears to be JSON Lines.
 */
export function isJsonLines(firstLines: readonly string[]): boolean {
  for (const line of firstLines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        typeof (parsed as Record<string, unknown>)["type"] === "string"
      ) {
        return true;
      }
    } catch {
      // Not valid JSON — skip and check next line
    }
  }
  return false;
}
