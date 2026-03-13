import type { ValidateOutput } from "../tfjson/validate-output.js";

/**
 * Parses the single JSON object produced by `terraform validate -json` or
 * `tofu validate -json` into a typed ValidateOutput.
 *
 * Unlike most other `-json` command outputs (which produce JSON Lines), the
 * validate command emits exactly one JSON object.
 *
 * Throws a descriptive Error if:
 *   - The string is not valid JSON
 *   - The parsed value is not an object
 *   - The `format_version` field is missing
 *
 * Error messages never include raw input content (which may contain sensitive values).
 */
export function parseValidateOutput(json: string): ValidateOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error(
      "Failed to parse validate output: input is not valid JSON",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Validate output must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj["format_version"] !== "string") {
    throw new Error(
      "Validate output is missing required field: format_version",
    );
  }

  return parsed as ValidateOutput;
}
