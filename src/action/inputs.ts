/**
 * Parse GitHub Action inputs from `INPUT_*` environment variables.
 *
 * Follows the same convention as `@actions/core`: input names are
 * uppercased with spaces replaced by underscores, then looked up as
 * `INPUT_<NAME>` in the environment.
 */

import type { Env } from "../env/index.js";

/** Parsed action inputs with defaults applied. */
export interface ActionInputs {
  steps: string;
  workspace: string;
  targetStep: string | undefined;
  githubToken: string;
  initStepId: string;
  validateStepId: string;
  planStepId: string;
  showPlanStepId: string;
  applyStepId: string;
}

/**
 * Read a single action input from the environment.
 *
 * Mirrors the `@actions/core` `getInput()` convention: the input name
 * is uppercased, spaces become underscores, and the value is trimmed.
 */
function readInput(env: Env, name: string): string {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return env[key]?.trim() ?? "";
}

/**
 * Parse and validate action inputs from the environment.
 *
 * @param env - Environment variable record (DI — must not read `process.env` directly)
 * @returns Validated action inputs with defaults applied
 * @throws If required inputs (`steps`, `github-token`) are missing
 */
export function parseInputs(env: Env): ActionInputs {
  const steps = readInput(env, "steps");
  if (steps === "") {
    throw new Error("Input 'steps' is required but was not provided");
  }

  const githubToken = readInput(env, "github-token");
  if (githubToken === "") {
    throw new Error("Input 'github-token' is required but was not provided");
  }

  const rawWorkspace = readInput(env, "workspace");
  const workspace =
    rawWorkspace !== ""
      ? rawWorkspace
      : `${env["GITHUB_WORKFLOW"] ?? "Workflow"}/${env["GITHUB_JOB"] ?? "Job"}`;

  const rawTargetStep = readInput(env, "target-step");
  const targetStep = rawTargetStep !== "" ? rawTargetStep : undefined;

  return {
    steps,
    workspace,
    targetStep,
    githubToken,
    initStepId: readInput(env, "init-step-id") || "init",
    validateStepId: readInput(env, "validate-step-id") || "validate",
    planStepId: readInput(env, "plan-step-id") || "plan",
    showPlanStepId: readInput(env, "show-plan-step-id") || "show-plan",
    applyStepId: readInput(env, "apply-step-id") || "apply",
  };
}
