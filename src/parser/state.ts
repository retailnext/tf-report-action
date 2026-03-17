import type { State } from "../tfjson/state.js";

/**
 * Parses a JSON string produced by `terraform state pull` or
 * `tofu state pull` into a typed State object. Throws a descriptive
 * Error if:
 * - The string is not valid JSON (error message will not contain state content)
 * - The format_version major component is greater than 1
 *
 * An empty state (e.g. from a workspace with no resources) is valid and
 * will have `values` set to `undefined`.
 */
export function parseState(json: string): State {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    // Do not include the underlying SyntaxError detail — Node.js 20+ embeds
    // a snippet of the raw input in the message, which may contain sensitive values.
    throw new Error("Failed to parse state JSON: input is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("State JSON must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  const formatVersion = obj["format_version"];
  if (typeof formatVersion !== "string") {
    throw new Error("State JSON is missing required field: format_version");
  }

  const majorStr = formatVersion.split(".")[0] ?? "0";
  const major = parseInt(majorStr, 10);
  if (isNaN(major) || major > 1) {
    throw new Error(
      `Unsupported state format_version: ${formatVersion} (major version ${String(major)} > 1)`,
    );
  }

  return parsed as State;
}
