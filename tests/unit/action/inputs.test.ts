import { describe, it, expect } from "vitest";
import { parseInputs } from "../../../src/action/inputs.js";
import type { Env } from "../../../src/env/index.js";

/** Build a minimal env with all required inputs set. */
function baseEnv(): Env {
  return {
    INPUT_STEPS: '{"init":{"outcome":"success"}}',
    "INPUT_GITHUB-TOKEN": "ghp_test123",
    GITHUB_WORKFLOW: "CI",
    GITHUB_JOB: "plan",
  };
}

describe("parseInputs", () => {
  it("parses required inputs", () => {
    const result = parseInputs(baseEnv());
    expect(result.steps).toBe('{"init":{"outcome":"success"}}');
    expect(result.githubToken).toBe("ghp_test123");
  });

  it("throws when steps is missing", () => {
    const env = baseEnv();
    delete env["INPUT_STEPS"];
    expect(() => parseInputs(env)).toThrow("Input 'steps' is required");
  });

  it("throws when steps is empty/whitespace", () => {
    const env = baseEnv();
    env["INPUT_STEPS"] = "   ";
    expect(() => parseInputs(env)).toThrow("Input 'steps' is required");
  });

  it("throws when github-token is missing", () => {
    const env = baseEnv();
    delete env["INPUT_GITHUB-TOKEN"];
    expect(() => parseInputs(env)).toThrow("Input 'github-token' is required");
  });

  it("derives workspace from GITHUB_WORKFLOW/GITHUB_JOB", () => {
    const result = parseInputs(baseEnv());
    expect(result.workspace).toBe("CI/plan");
  });

  it("falls back to Workflow/Job when env vars are missing", () => {
    const env = baseEnv();
    delete env["GITHUB_WORKFLOW"];
    delete env["GITHUB_JOB"];
    const result = parseInputs(env);
    expect(result.workspace).toBe("Workflow/Job");
  });

  it("uses explicit workspace when provided", () => {
    const env = { ...baseEnv(), INPUT_WORKSPACE: "  prod  " };
    const result = parseInputs(env);
    expect(result.workspace).toBe("prod");
  });

  it("uses default step IDs", () => {
    const result = parseInputs(baseEnv());
    expect(result.initStepId).toBe("init");
    expect(result.validateStepId).toBe("validate");
    expect(result.planStepId).toBe("plan");
    expect(result.showPlanStepId).toBe("show-plan");
    expect(result.applyStepId).toBe("apply");
  });

  it("accepts custom step ID overrides", () => {
    const env: Env = {
      ...baseEnv(),
      "INPUT_INIT-STEP-ID": "my-init",
      "INPUT_VALIDATE-STEP-ID": "my-validate",
      "INPUT_PLAN-STEP-ID": "my-plan",
      "INPUT_SHOW-PLAN-STEP-ID": "my-show",
      "INPUT_APPLY-STEP-ID": "my-apply",
    };
    const result = parseInputs(env);
    expect(result.initStepId).toBe("my-init");
    expect(result.validateStepId).toBe("my-validate");
    expect(result.planStepId).toBe("my-plan");
    expect(result.showPlanStepId).toBe("my-show");
    expect(result.applyStepId).toBe("my-apply");
  });

  it("returns undefined for target-step when not provided", () => {
    const result = parseInputs(baseEnv());
    expect(result.targetStep).toBeUndefined();
  });

  it("returns target-step when provided", () => {
    const env: Env = { ...baseEnv(), "INPUT_TARGET-STEP": "plan" };
    const result = parseInputs(env);
    expect(result.targetStep).toBe("plan");
  });

  it("trims input values", () => {
    const env: Env = {
      ...baseEnv(),
      INPUT_STEPS: '  {"init":{}}  ',
      "INPUT_GITHUB-TOKEN": "  token  ",
    };
    const result = parseInputs(env);
    expect(result.steps).toBe('{"init":{}}');
    expect(result.githubToken).toBe("token");
  });
});
