import type { Plan } from "../tfjson/plan.js";

/**
 * Parses a JSON string produced by `terraform show -json` or `tofu show -json`
 * into a typed Plan object. Throws a descriptive Error if:
 * - The string is not valid JSON (error message will not contain plan content)
 * - The format_version major component is greater than 1
 * - resource_changes is missing
 */
export function parsePlan(json: string): Plan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    // Do not include the underlying SyntaxError detail — Node.js 20+ embeds
    // a snippet of the raw input in the message, which may contain sensitive values.
    throw new Error(
      "Failed to parse plan JSON: input is not valid JSON",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Plan JSON must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  const formatVersion = obj["format_version"];
  if (typeof formatVersion !== "string") {
    throw new Error("Plan JSON is missing required field: format_version");
  }

  const majorStr = formatVersion.split(".")[0] ?? "0";
  const major = parseInt(majorStr, 10);
  if (isNaN(major) || major > 1) {
    throw new Error(
      `Unsupported plan format_version: ${formatVersion} (major version ${String(major)} > 1)`,
    );
  }

  if (!("resource_changes" in obj)) {
    throw new Error("Plan JSON is missing required field: resource_changes");
  }

  return parsed as Plan;
}
