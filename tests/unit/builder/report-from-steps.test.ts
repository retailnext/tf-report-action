import { describe, it, expect } from "vitest";
import { buildReportFromSteps } from "../../../src/builder/report-from-steps.js";

/** Minimal env that suppresses logs URL. */
const NO_ENV = { HOME: "/tmp" };

/** Build a steps JSON string from a plain object. */
function stepsJson(
  steps: Record<string, { outcome: string; outputs?: Record<string, string> }>,
): string {
  const obj: Record<
    string,
    { outcome: string; conclusion: string; outputs: Record<string, string> }
  > = {};
  for (const [id, s] of Object.entries(steps)) {
    obj[id] = {
      outcome: s.outcome,
      conclusion: s.outcome,
      outputs: s.outputs ?? {},
    };
  }
  return JSON.stringify(obj);
}

describe("buildReportFromSteps — operation skipped", () => {
  it("reports Plan Skipped for the exact bug scenario (config:success, all IaC steps skipped)", () => {
    // This is the bug: config has outcome "success" but all IaC steps are skipped.
    // Previously produced "✅ `tf` Plan Succeeded".
    const json = stepsJson({
      config: { outcome: "success", outputs: { name: "tf" } },
      init: { outcome: "skipped" },
      validate: { outcome: "skipped" },
      plan: { outcome: "skipped" },
      "show-plan": { outcome: "skipped" },
    });
    const report = buildReportFromSteps(json, { workspace: "tf", env: NO_ENV });
    expect(report.title).toEqual({
      status: "warning",
      workspace: "tf",
      body: { kind: "operation-skipped", operation: "plan" },
    });
  });

  it("reports Plan Skipped when init succeeds but plan step is skipped", () => {
    const json = stepsJson({
      init: { outcome: "success" },
      validate: { outcome: "success" },
      plan: { outcome: "skipped" },
      "show-plan": { outcome: "skipped" },
    });
    const report = buildReportFromSteps(json, { env: NO_ENV });
    expect(report.title).toEqual({
      status: "warning",
      body: { kind: "operation-skipped", operation: "plan" },
    });
  });

  it("reports Apply Skipped when only apply step is present and it is skipped", () => {
    const json = stepsJson({
      apply: { outcome: "skipped" },
    });
    const report = buildReportFromSteps(json, { env: NO_ENV });
    expect(report.title).toEqual({
      status: "warning",
      body: { kind: "operation-skipped", operation: "apply" },
    });
  });

  it("reports Plan Skipped when plan and apply are both skipped", () => {
    // apply is skipped, so operation falls back to plan
    const json = stepsJson({
      plan: { outcome: "skipped" },
      "show-plan": { outcome: "skipped" },
      apply: { outcome: "skipped" },
    });
    const report = buildReportFromSteps(json, { env: NO_ENV });
    expect(report.title).toEqual({
      status: "warning",
      body: { kind: "operation-skipped", operation: "plan" },
    });
  });

  it("does not report skipped when plan step succeeds (no stdout — falls back to Plan Succeeded)", () => {
    // plan outcome is "success" but there is no stdout_file to read, so no
    // structured data — should fall through to "Plan Succeeded" not "Plan Skipped".
    const json = stepsJson({
      init: { outcome: "success" },
      plan: { outcome: "success" },
      "show-plan": { outcome: "success" },
    });
    const report = buildReportFromSteps(json, { env: NO_ENV });
    expect(report.title.body.kind).not.toBe("operation-skipped");
    expect(report.title.body.kind).not.toBe("all-skipped");
    expect(report.title.body).toHaveProperty("operation", "plan");
  });
});
