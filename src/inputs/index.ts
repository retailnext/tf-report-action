/**
 * Parse GitHub Actions runtime context into typed data.
 *
 * This module handles two forms of action context: `INPUT_*` environment
 * variables (the action's declared inputs) and the event payload file
 * (which provides context like the pull request number). Both are pure
 * parsing — no live infrastructure required.
 */

import { readFileSync } from "node:fs";
import type { Env } from "../env/index.js";

/** Parsed action inputs with defaults applied. */
export interface ActionInputs {
  steps: string;
  workspace: string;
  targetStep: string | undefined;
  githubToken: string;
  alwaysUploadReport: boolean;
  initStepId: string;
  validateStepId: string;
  planStepId: string;
  showPlanStepId: string;
  applyStepId: string;
  stateStepId: string;
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
    alwaysUploadReport: readInput(env, "always-upload-report") === "true",
    initStepId: readInput(env, "init-step-id") || "init",
    validateStepId: readInput(env, "validate-step-id") || "validate",
    planStepId: readInput(env, "plan-step-id") || "plan",
    showPlanStepId: readInput(env, "show-plan-step-id") || "show-plan",
    applyStepId: readInput(env, "apply-step-id") || "apply",
    stateStepId: readInput(env, "state-step-id") || "state",
  };
}

/**
 * Read the pull request number from the event payload file.
 *
 * Returns `undefined` if the file cannot be read or the payload does
 * not contain a `pull_request.number` field.
 */
export function readPrNumber(eventPath: string): number | undefined {
  try {
    const raw = readFileSync(eventPath, "utf-8");
    const event = JSON.parse(raw) as {
      pull_request?: { number?: number };
    };
    const num = event.pull_request?.number;
    return typeof num === "number" ? num : undefined;
  } catch {
    return undefined;
  }
}
