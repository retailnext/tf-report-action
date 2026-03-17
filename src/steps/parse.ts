/**
 * Parse and validate a JSON-serialized GitHub Actions steps context.
 *
 * The input is the string produced by `${{ toJSON(steps) }}` in a workflow.
 * This parser validates the structural shape but is lenient about unknown
 * properties — the steps context may contain fields added by future GitHub
 * Actions runtime versions.
 */

import type { StepData, Steps } from "./types.js";

/**
 * Parse a JSON string into a validated {@link Steps} record.
 *
 * @param json - The JSON-serialized steps context
 * @returns A validated Steps record
 * @throws {Error} If the input is not valid JSON or not a JSON object
 */
export function parseSteps(json: string): Steps {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Steps context is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Steps context must be a JSON object");
  }

  const raw = parsed as Record<string, unknown>;
  const result: Record<string, StepData> = {};

  for (const [stepId, value] of Object.entries(raw)) {
    result[stepId] = validateStepData(stepId, value);
  }

  return result;
}

/**
 * Validate and normalize a single step's data from the raw parsed JSON.
 *
 * Lenient: accepts missing fields (steps that haven't run yet may have
 * incomplete data), but ensures that present fields have the right types.
 */
function validateStepData(stepId: string, raw: unknown): StepData {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Steps context: step "${stepId}" must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  const outcome = validateOptionalString(obj["outcome"], stepId, "outcome");
  const conclusion = validateOptionalString(
    obj["conclusion"],
    stepId,
    "conclusion",
  );
  const outputs = validateOutputs(obj["outputs"], stepId);

  return {
    ...(outcome !== undefined ? { outcome } : {}),
    ...(conclusion !== undefined ? { conclusion } : {}),
    ...(outputs !== undefined ? { outputs } : {}),
  };
}

function validateOptionalString(
  value: unknown,
  stepId: string,
  field: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Steps context: step "${stepId}" field "${field}" must be a string`,
    );
  }
  return value;
}

function validateOutputs(
  value: unknown,
  stepId: string,
): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Steps context: step "${stepId}" field "outputs" must be an object`,
    );
  }

  const raw = value as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const [key, val] of Object.entries(raw)) {
    if (typeof val === "string") {
      result[key] = val;
    }
    // Non-string output values are silently dropped — the steps context
    // may contain structured data from composite actions, but we only
    // consume string-valued outputs.
  }

  return result;
}
