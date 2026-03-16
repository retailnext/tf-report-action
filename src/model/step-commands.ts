import type { Tool } from "./report.js";

/**
 * Recognized step roles in the pipeline.
 *
 * Each role maps to a CLI command whose JSON output the pipeline can consume.
 * Not all roles are parsed today — this type is intentionally exhaustive so
 * that future parsers can reuse `expectedCommand()` without model changes.
 */
export type StepRole = "show-plan" | "plan" | "apply" | "validate" | "init";

/**
 * Returns the expected CLI command (with `-json` flag) for a given step role.
 *
 * Used in warning notes and StepIssue diagnostics to tell the user what
 * command was expected. The `<tfplan>` placeholder is left in place because
 * we do not know the user's plan filename.
 *
 * When `tool` is `undefined` the tool prefix is omitted
 * (e.g., `show -json <tfplan>` instead of `tofu show -json <tfplan>`).
 */
export function expectedCommand(
  tool: Tool | undefined,
  role: StepRole,
): string {
  const prefix = tool !== undefined ? `${tool} ` : "";
  switch (role) {
    case "show-plan":
      return `${prefix}show -json <tfplan>`;
    case "plan":
      return `${prefix}plan -json -out=<tfplan>`;
    case "apply":
      return `${prefix}apply -json <tfplan>`;
    case "validate":
      return `${prefix}validate -json`;
    case "init":
      return `${prefix}init -json`;
  }
}
