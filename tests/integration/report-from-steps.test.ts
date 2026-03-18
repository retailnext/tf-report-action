import { describe, it, expect, beforeAll } from "vitest";
import { reportFromSteps } from "../../src/index.js";
import type { ReportOptions } from "../../src/index.js";
import {
  discoverStepsFixtures,
  discoverPlanStepsFixtures,
  discoverNoShowStepsFixtures,
  discoverApplyNoShowStepsFixtures,
  discoverApplyOnlyStepsFixtures,
  discoverNoStateStepsFixtures,
  discoverManualStepsFixtures,
  resolveStepFilePaths,
  assertCorrectToolName,
} from "../helpers/fixture-loader.js";

// ---------- Generated fixtures (full workflow — Tier 1 with apply) ----------

const generatedFixtures = discoverStepsFixtures();
const planOnlyFixtures = discoverPlanStepsFixtures();
const noShowFixtures = discoverNoShowStepsFixtures();
const applyNoShowFixtures = discoverApplyNoShowStepsFixtures();
const applyOnlyFixtures = discoverApplyOnlyStepsFixtures();

beforeAll(() => {
  if (generatedFixtures.length === 0) {
    throw new Error(
      "No steps.json fixtures found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
  if (planOnlyFixtures.length === 0) {
    throw new Error(
      "No plan-steps.json fixtures found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
  if (noShowFixtures.length === 0) {
    throw new Error(
      "No no-show-steps.json fixtures found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
  if (applyNoShowFixtures.length === 0) {
    throw new Error(
      "No apply-no-show-steps.json fixtures found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
  if (applyOnlyFixtures.length === 0) {
    throw new Error(
      "No apply-only-steps.json fixtures found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
    );
  }
});

/** Env with no GitHub vars — suppresses logs URL. */
const NO_GITHUB_ENV = { HOME: "/tmp" };

describe("reportFromSteps integration — generated fixtures", () => {
  for (const { label, stepsJson, fixtureDir } of generatedFixtures) {
    describe(label, () => {
      it("renders without error and matches snapshot [default]", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });

      it("renders with workspace and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          workspace: "test-workspace",
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
      });
    });
  }
});

// ---------- Custom step IDs (verify step ID overrides work end-to-end) ----------

/**
 * Renames step keys in a steps JSON string, mapping default IDs to custom ones.
 * This simulates a user configuring custom step IDs in their workflow.
 */
function renameStepKeys(
  stepsJson: string,
  mapping: Record<string, string>,
): string {
  const steps = JSON.parse(stepsJson) as Record<string, unknown>;
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(steps)) {
    renamed[mapping[key] ?? key] = value;
  }
  return JSON.stringify(renamed);
}

const CUSTOM_STEP_IDS = {
  init: "my-init",
  validate: "my-validate",
  plan: "my-plan",
  "show-plan": "my-show-plan",
  apply: "my-apply",
  state: "my-state",
} as const;

const CUSTOM_STEP_ID_OPTIONS: Partial<ReportOptions> = {
  initStepId: CUSTOM_STEP_IDS.init,
  validateStepId: CUSTOM_STEP_IDS.validate,
  planStepId: CUSTOM_STEP_IDS.plan,
  showPlanStepId: CUSTOM_STEP_IDS["show-plan"],
  applyStepId: CUSTOM_STEP_IDS.apply,
  stateStepId: CUSTOM_STEP_IDS.state,
};

describe("reportFromSteps integration — custom step IDs", () => {
  for (const { label, stepsJson, fixtureDir } of generatedFixtures) {
    describe(label, () => {
      it("produces structured output with renamed steps and custom IDs", () => {
        // Render with default step IDs
        const defaultResolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const defaultResult = reportFromSteps(defaultResolved, {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        });

        // Render with custom step IDs
        const renamedJson = renameStepKeys(stepsJson, CUSTOM_STEP_IDS);
        const renamedResolved = resolveStepFilePaths(renamedJson, fixtureDir);
        const customResult = reportFromSteps(renamedResolved, {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
          ...CUSTOM_STEP_ID_OPTIONS,
        });

        // Both should produce the same report tier (structured, not degraded)
        // Step IDs appear in step tables and error headings, so exact match
        // won't work — verify structural equivalence instead.
        const defaultHasSummary = /Plan Summary|Apply Summary|No Changes/.test(
          defaultResult,
        );
        const customHasSummary = /Plan Summary|Apply Summary|No Changes/.test(
          customResult,
        );
        expect(customHasSummary).toBe(defaultHasSummary);

        // If default has resource detail, custom should too
        const defaultHasResources = defaultResult.includes("| Attribute");
        const customHasResources = customResult.includes("| Attribute");
        expect(customHasResources).toBe(defaultHasResources);

        // Custom output should reference custom step IDs in step table
        for (const customId of Object.values(CUSTOM_STEP_IDS)) {
          if (customResult.includes(customId)) {
            expect(defaultResult).not.toContain(customId);
          }
        }
      });
    });
  }

  for (const { label, stepsJson, fixtureDir } of planOnlyFixtures) {
    describe(label, () => {
      it("produces structured plan output with renamed steps and custom IDs", () => {
        const defaultResolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const defaultResult = reportFromSteps(defaultResolved, {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        });

        const renamedJson = renameStepKeys(stepsJson, CUSTOM_STEP_IDS);
        const renamedResolved = resolveStepFilePaths(renamedJson, fixtureDir);
        const customResult = reportFromSteps(renamedResolved, {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
          ...CUSTOM_STEP_ID_OPTIONS,
        });

        // Both should produce plan content (not degraded)
        const defaultHasPlan = /Plan Summary|Plan Output|No Changes/.test(
          defaultResult,
        );
        const customHasPlan = /Plan Summary|Plan Output|No Changes/.test(
          customResult,
        );
        expect(customHasPlan).toBe(defaultHasPlan);
      });
    });
  }

  it("degrades to Tier 4 when step IDs do not match", () => {
    // Use the first generated fixture with default IDs but custom step ID options
    // This means the steps won't be found → should degrade to workflow table
    const fixture = generatedFixtures[0]!;
    const resolved = resolveStepFilePaths(
      fixture.stepsJson,
      fixture.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture.fixtureDir],
      env: NO_GITHUB_ENV,
      ...CUSTOM_STEP_ID_OPTIONS,
    });

    // Should NOT contain structured plan/apply output
    expect(result).not.toContain("Plan Summary");
    expect(result).not.toContain("Apply Summary");
    // Should still render (Tier 4 workflow table)
    expect(result).toBeTruthy();
  });
});

describe("reportFromSteps integration — plan-only fixtures", () => {
  for (const { label, stepsJson, fixtureDir } of planOnlyFixtures) {
    describe(label, () => {
      it("renders plan report and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });

      it("produces plan output (not apply)", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        // Plan-only should never show "Apply Summary" or "Apply Output"
        expect(result).not.toContain("Apply Summary");
        expect(result).not.toContain("Apply Output");
        // Should have plan-related content (structured or fallback)
        expect(result).toMatch(
          /Plan Summary|No Changes|Plan Output|Plan|No readable output/,
        );
      });
    });
  }
});

// ---------- No-show fixtures (Tier 3 text fallback) ----------

describe("reportFromSteps integration — no-show fixtures (Tier 3)", () => {
  for (const { label, stepsJson, fixtureDir } of noShowFixtures) {
    describe(label, () => {
      it("renders without error and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });

      it("produces structured output from JSONL (Tier 2 enrichment)", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        // Tier 2 produces structured output from JSONL scanning, or no-change plan with just step table.
        // When structured data is available, should have a warning about limited detail.
        // When no changes were detected, just step statuses are shown.
        // Either way, should NOT show "raw command output" text block.
        expect(result).not.toContain("```\n{");
      });
    });
  }
});

// ---------- Apply-no-show fixtures (apply present, no show-plan → Tier 3 with apply) ----------

describe("reportFromSteps integration — apply-no-show fixtures", () => {
  for (const { label, stepsJson, fixtureDir } of applyNoShowFixtures) {
    describe(label, () => {
      it("renders without error and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });

      it("includes structured or raw output", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        // Should have structured content, raw output blocks, or at minimum step statuses
        expect(result).toMatch(
          /Plan Summary|Apply Summary|Plan Output|Apply Output|No readable output|raw command output|stdout_file output missing|failed|attribute details|Steps/,
        );
      });
    });
  }
});

// ---------- Apply-only fixtures (init+validate+apply, no plan/show → Tier 3 apply-only) ----------

describe("reportFromSteps integration — apply-only fixtures", () => {
  for (const { label, stepsJson, fixtureDir } of applyOnlyFixtures) {
    describe(label, () => {
      it("renders without error and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });

      it("produces output for apply-only fixture", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        // No plan step means no Plan Output section
        expect(result).not.toContain("Plan Output");
        // Should have either apply content, step table, or note about unavailable output
        expect(result).toMatch(/Apply|Steps|Outcome|No readable output/);
      });
    });
  }
});

// ---------- Targeted assertions for move/import/forget/no-op ----------

describe("reportFromSteps — action classification", () => {
  it("null-lifecycle/3: truly unchanged resource produces 'No Changes' with no resource section", () => {
    const fixture = planOnlyFixtures.find((f) =>
      f.label.includes("null-lifecycle/3"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("No Changes");
    expect(result).not.toContain("Resource Changes");
  });

  for (const toolLabel of [
    "terraform/state-operations/1/plan-only",
    "tofu/state-operations/1/plan-only",
  ]) {
    it(`${toolLabel}: moved resource shows 🚚 Move in summary`, () => {
      const fixture = planOnlyFixtures.find((f) => f.label === toolLabel);
      expect(fixture).toBeDefined();
      const resolved = resolveStepFilePaths(
        fixture!.stepsJson,
        fixture!.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture!.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).toContain("1 to move");
      expect(result).toContain("🚚");
      expect(result).toContain("Move");
      expect(result).not.toContain("No Changes");
    });
  }

  for (const toolLabel of [
    "terraform/state-operations/1/plan-only",
    "tofu/state-operations/1/plan-only",
  ]) {
    it(`${toolLabel}: imported resource shows 📥 Import in summary`, () => {
      const fixture = planOnlyFixtures.find((f) => f.label === toolLabel);
      expect(fixture).toBeDefined();
      const resolved = resolveStepFilePaths(
        fixture!.stepsJson,
        fixture!.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture!.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).toContain("1 to import");
      expect(result).toContain("📥");
      expect(result).toContain("Import");
      expect(result).not.toContain("No Changes");
    });
  }

  it("terraform/state-operations/1: forgotten resource shows 👋 Forget in summary", () => {
    const fixture = planOnlyFixtures.find(
      (f) => f.label === "terraform/state-operations/1/plan-only",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("1 to forget");
    expect(result).toContain("👋");
    expect(result).toContain("Forget");
    expect(result).not.toContain("No Changes");
  });

  it("tofu/state-operations/1: forgotten resource shows 👋 Forget in summary", () => {
    const fixture = planOnlyFixtures.find(
      (f) => f.label === "tofu/state-operations/1/plan-only",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("1 to forget");
    expect(result).toContain("👋");
    expect(result).toContain("Forget");
    expect(result).not.toContain("No Changes");
  });
});

// ---------- Targeted assertions for state-operations/1 apply (forget) ----------

describe("reportFromSteps — forget in apply output", () => {
  for (const toolLabel of [
    "terraform/state-operations/1",
    "tofu/state-operations/1",
  ]) {
    describe(toolLabel, () => {
      it("shows forgotten resource (not 'No Changes') in apply report", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).not.toContain("No Changes");
        expect(result).toContain("ephemeral");
      });

      it("shows 👋 Forgotten in Apply Summary", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("👋");
        expect(result).toContain("Forgotten");
      });

      it("uses Apply Summary heading", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("## Apply Summary");
        expect(result).not.toContain("## Plan Summary");
      });
    });
  }
});

// ---------- Targeted assertions for state-only operations in apply output ----------

describe("reportFromSteps — state-only operations in apply output", () => {
  for (const toolLabel of [
    "terraform/state-operations/1",
    "tofu/state-operations/1",
  ]) {
    describe(`${toolLabel} move operation`, () => {
      it("shows moved resource (not 'No Changes') in apply report", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).not.toContain("No Changes");
        expect(result).toContain("renamed");
      });

      it("shows 🚚 Moved in Apply Summary", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("🚚");
        expect(result).toContain("Moved");
      });

      it("uses Apply Summary heading", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("## Apply Summary");
        expect(result).not.toContain("## Plan Summary");
      });
    });
  }

  for (const toolLabel of [
    "terraform/state-operations/1",
    "tofu/state-operations/1",
  ]) {
    describe(`${toolLabel} state-only import`, () => {
      it("shows imported resource (not 'No Changes') in apply report", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).not.toContain("No Changes");
        expect(result).toContain("imported");
      });

      it("shows 📥 Imported in Apply Summary", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("📥");
        expect(result).toContain("Imported");
      });

      it("uses Apply Summary heading", () => {
        const fixture = generatedFixtures.find((f) => f.label === toolLabel);
        expect(fixture).toBeDefined();
        const resolved = resolveStepFilePaths(
          fixture!.stepsJson,
          fixture!.fixtureDir,
        );
        const result = reportFromSteps(resolved, {
          allowedDirs: [fixture!.fixtureDir],
          env: NO_GITHUB_ENV,
        });
        expect(result).toContain("## Apply Summary");
        expect(result).not.toContain("## Plan Summary");
      });
    });
  }
});

// ---------- Manual fixtures ----------

const manualFixtures = discoverManualStepsFixtures();

describe("reportFromSteps integration — manual fixtures", () => {
  for (const { label, stepsJson, fixtureDir } of manualFixtures) {
    describe(label, () => {
      it("renders without error and matches snapshot", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        expect(result).toMatchSnapshot();
        assertCorrectToolName(result, label);
      });
    });
  }
});

// ---------- Targeted assertions — error fixtures ----------

describe("reportFromSteps integration — error fixture scenarios", () => {
  it("error-stages/1: renders failed validate with error details", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("error-stages/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show the failed validate step
    expect(result).toContain("`validate` failed");
    // Should show failure icon
    expect(result).toContain("❌");
  });

  it("error-stages/1: with workspace shows workspace in title", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("error-stages/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      workspace: "my-ws",
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("`my-ws`");
    expect(result).toContain("❌");
  });

  it("error-stages/2: renders failed plan with step issue details", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("error-stages/2"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show failure icon
    expect(result).toContain("❌");
    // Plan failed — should have step issue with plan failure details
    expect(result).toContain("`plan` failed");
  });

  it("error-stages/2: plan-only variant shows plan failure without apply", () => {
    const fixture = planOnlyFixtures.find((f) =>
      f.label.includes("error-stages/2"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("❌");
    expect(result).not.toContain("Apply");
  });

  it("error-stages/1: no-show variant exercises Tier 3 no-output path", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("error-stages/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Validate failed, plan was skipped (no stdout_file) → Tier 3 with no readable output
    expect(result).toContain("`validate` failed");
    // Should show step status table since no output is available
    expect(result).toContain("| Step | Outcome |");
  });

  it("no-show fixture with readable plan stdout produces JSONL-enriched report", () => {
    // Pick a normal (non-error) fixture's no-show variant
    const fixture = noShowFixtures.find(
      (f) => f.label.includes("null-lifecycle") && !f.label.includes("0/"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should produce structured output from JSONL scanning (Tier 2)
    // with a warning about limited attribute detail
    expect(result).toContain("attribute details are not available");
    expect(result).toContain("Plan Summary");
  });

  it("no-show fixture under budget pressure truncates output", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("null-lifecycle"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 500,
      env: NO_GITHUB_ENV,
    });
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("no-show fixture with logs URL includes truncation notice with URL", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("null-lifecycle"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 200,
      env: {
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "99999",
        GITHUB_RUN_ATTEMPT: "2",
      },
    });
    expect(result).toContain(
      "https://github.com/owner/repo/actions/runs/99999/attempts/2",
    );
  });

  it("invocation-variants: shows structured plan from show-plan even though apply was not -json", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("invocation-variants/0"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show structured content (show-plan JSON was available)
    expect(result).toMatch(/Plan Summary|Apply Summary/);
    // Apply ran but was not -json, so scanner finds no records — this results
    // in an apply report with all resources phantom-filtered out
    expect(result).toContain("Apply");
    // Title should NOT be failure since apply succeeded
    expect(result).toContain("✅");
  });

  it("apply-no-show: shows JSONL-enriched apply report (no show-plan)", () => {
    const fixture = applyNoShowFixtures.find(
      (f) => f.label.includes("null-lifecycle") && f.label.includes("/2/"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show JSONL-enriched report with apply data
    expect(result).toMatch(/Apply|attribute details/);
  });

  it("apply-only: shows only apply output with no plan section", () => {
    const fixture = applyOnlyFixtures.find(
      (f) => f.label.includes("null-lifecycle") && f.label.includes("/2/"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // No plan step, so no Plan Output section
    expect(result).not.toContain("Plan Output");
    // Should have apply content
    expect(result).toContain("Apply");
  });
});

// ---------- Targeted assertions — general scenarios ----------

describe("reportFromSteps integration — targeted scenarios", () => {
  it("includes logs URL when GitHub env vars are set and output is truncated", () => {
    const fixture = generatedFixtures[0];
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 500,
      env: {
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "12345",
        GITHUB_RUN_ATTEMPT: "1",
      },
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain(
      "https://github.com/owner/repo/actions/runs/12345/attempts/1",
    );
  });

  it("includes workspace dedup marker when workspace is set", () => {
    const fixture = generatedFixtures[0];
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      workspace: "my-workspace",
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain('<!-- tf-report-action:"my-workspace" -->');
    expect(result).toContain("`my-workspace`");
  });

  it("handles budget pressure by truncating output", () => {
    const fixture = generatedFixtures[0];
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 700,
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result.length).toBeLessThanOrEqual(700);
  });

  it("produces Tier 1 report for fixtures with show-plan.stdout", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("null-lifecycle"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    // Tier 1 report has structured summary (Plan or Apply depending on step presence)
    expect(result).toMatch(/Plan Summary|Apply Summary/);
  });

  it("uses apply titles for apply fixtures", () => {
    const fixture = generatedFixtures.find(
      (f) => f.label.includes("null-lifecycle") && f.label.endsWith("/2"),
    );
    if (fixture == null) return;
    const resolved = resolveStepFilePaths(
      fixture.stepsJson,
      fixture.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain("Apply");
  });

  it("shows error details for apply-error fixtures", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("apply-error/1"),
    );
    if (fixture == null) return;
    const resolved = resolveStepFilePaths(
      fixture.stepsJson,
      fixture.fixtureDir,
    );
    const options: ReportOptions = {
      allowedDirs: [fixture.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain("❌");
  });

  it("handles invalid steps JSON gracefully", () => {
    const result = reportFromSteps("not valid json", {
      env: NO_GITHUB_ENV,
    });
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty steps gracefully", () => {
    const result = reportFromSteps("{}", {
      env: NO_GITHUB_ENV,
    });
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------- Targeted assertions — all called-out rendering cases ----------

describe("reportFromSteps integration — rendering quality", () => {
  it("error-stages/2: title clearly says Plan Failed", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("error-stages/2"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("Plan Failed");
    expect(result).toContain("❌");
  });

  it("error-stages/1/no-show: shows graphically formatted diagnostics, not raw JSON", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("error-stages/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should format diagnostics with severity icons and summary text
    expect(result).toContain("🚨");
    expect(result).toContain("**Reference to undeclared input variable**");
    // Validate output should include collapsed raw JSON
    expect(result).toContain("Show raw JSON");
    expect(result).toContain("<details>");
  });

  it("null-lifecycle/2/apply-no-show: JSONL-enriched structured apply report", () => {
    const fixture = applyNoShowFixtures.find((f) =>
      f.label.includes("null-lifecycle/2"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // JSONL scanner produces structured data — summary and resource list
    expect(result).toMatch(/Apply.*replaced|Apply Summary/);
    // Warning about missing attribute detail
    expect(result).toContain("attribute details are not available");
  });

  it("apply-error/1/apply-no-show: title says Apply Failed", () => {
    const fixture = applyNoShowFixtures.find((f) =>
      f.label.includes("apply-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("❌");
    expect(result).toContain("Apply Failed");
  });

  it("deferred-data-source/2/no-show: shows JSONL-enriched plan with ⚠️ warning for limited detail", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("deferred-data-source/2"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("✅");
    expect(result).toContain("Plan");
    // Warning callout for limited attribute detail
    expect(result).toContain("⚠️");
    expect(result).toContain("attribute details are not available");
  });

  it("parse-failure: title is ✅ (not ❌) when all steps succeeded", () => {
    const fixture = discoverManualStepsFixtures().find((f) =>
      f.label.includes("parse-failure"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Title should NOT show ❌ — all steps succeeded
    expect(result).toMatch(/^## ✅/);
    // Should mention parse failure for show-plan
    expect(result).toMatch(
      /show-plan.*could not be parsed|output could not be parsed/,
    );
    // File read errors should appear as warnings
    expect(result).toContain("plan stdout:");
  });

  it("missing-outputs: uses correct wording with ⚠️ bullets", () => {
    const fixture = discoverManualStepsFixtures().find((f) =>
      f.label.includes("missing-outputs"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("stdout_file output missing in steps");
    expect(result).not.toContain("configured");
    // Each error line should have ⚠️
    const lines = result.split("\n").filter((l) => l.includes("stdout_file"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toContain("⚠️");
    }
  });

  it("unrelated-workflow: title identifies the failing step", () => {
    const fixture = discoverManualStepsFixtures().find((f) =>
      f.label.includes("unrelated-workflow"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("❌");
    expect(result).toContain("`test` Failed");
  });

  it("successful-workflow: title is ✅ Succeeded", () => {
    const fixture = discoverManualStepsFixtures().find((f) =>
      f.label.includes("successful-workflow"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("✅");
    expect(result).toContain("Succeeded");
    expect(result).not.toContain("❌");
    expect(result).not.toContain("Failed");
  });
});

// ---------- State enrichment ----------

const noStateFixtures = discoverNoStateStepsFixtures();

describe("reportFromSteps — state enrichment", () => {
  beforeAll(() => {
    if (noStateFixtures.length === 0) {
      throw new Error(
        "No no-state-steps.json fixtures found. Run: bash scripts/generate-fixtures.sh",
      );
    }
  });

  it("resolves unknown values when state step is present", () => {
    // null-lifecycle/2 creates a null_resource then replaces it — good test
    const fixture = generatedFixtures.find(
      (f) => f.label === "tofu/null-lifecycle/2",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // With state, unknown values should be resolved — no placeholder text
    expect(result).not.toContain("(value not in plan)");
    // Should NOT show the missing-state warning
    expect(result).not.toContain("could not be resolved");
  });

  it("shows missing-state warning when state step is absent", () => {
    // Find an apply fixture that would have unknown values
    const fixture = noStateFixtures.find(
      (f) => f.label === "tofu/null-lifecycle/2/no-state",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Without state, should show the warning
    expect(result).toContain("could not be resolved");
    expect(result).toContain("state pull");
  });

  it("does not show missing-state warning for plan-only reports", () => {
    const fixture = planOnlyFixtures.find(
      (f) => f.label === "tofu/null-lifecycle/2/plan-only",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Plan-only reports never show the missing-state warning
    expect(result).not.toContain("could not be resolved");
    expect(result).not.toContain("state pull");
  });

  it("masks sensitive state values as (sensitive)", () => {
    // sensitive-values/1 has sensitive attributes in state
    const fixture = generatedFixtures.find(
      (f) => f.label === "tofu/sensitive-values/1",
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(
      fixture!.stepsJson,
      fixture!.fixtureDir,
    );
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Sensitive values must be masked, not revealed
    expect(result).not.toContain("updated-secret-value");
    // Should not show missing-state warning (state is available)
    expect(result).not.toContain("could not be resolved");
  });

  // Snapshot all no-state fixtures to catch regressions
  for (const { label, stepsJson, fixtureDir } of noStateFixtures) {
    it(`no-state snapshot: ${label}`, () => {
      const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
      const options: ReportOptions = {
        allowedDirs: [fixtureDir],
        env: NO_GITHUB_ENV,
      };
      const result = reportFromSteps(resolved, options);
      expect(result).toMatchSnapshot();
      assertCorrectToolName(result, label);
    });
  }
});

// ---------- Security: sensitive values must never appear in output ----------

describe("reportFromSteps — sensitive value masking", () => {
  /**
   * Literal strings that must never appear in rendered output.
   * These are the actual secret values from the sensitive-values fixture.
   * Note: content_md5 hashes are NOT included — Terraform does not mark them
   * as sensitive, so they legitimately appear in attribute diffs.
   */
  const FORBIDDEN_STRINGS = ["initial-secret-value", "updated-secret-value"];

  function assertNoSecretLeaks(result: string, context: string): void {
    for (const secret of FORBIDDEN_STRINGS) {
      expect(result, `${context}: leaked "${secret}"`).not.toContain(secret);
    }
  }

  // Full workflow (Tier 1): has show-plan structured output
  for (const fixture of generatedFixtures) {
    if (!fixture.label.includes("sensitive-values")) continue;
    it(`${fixture.label}: no sensitive values in full-workflow output`, () => {
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      assertNoSecretLeaks(result, fixture.label);
    });
  }

  // Plan-only (Tier 1 without apply)
  for (const fixture of planOnlyFixtures) {
    if (!fixture.label.includes("sensitive-values")) continue;
    it(`${fixture.label}: no sensitive values in plan-only output`, () => {
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      assertNoSecretLeaks(result, fixture.label);
    });
  }

  // No-show fallback (Tier 3): raw plan stdout rendered directly
  for (const fixture of noShowFixtures) {
    if (!fixture.label.includes("sensitive-values")) continue;
    it(`${fixture.label}: no sensitive values in no-show fallback output`, () => {
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      assertNoSecretLeaks(result, fixture.label);
    });
  }

  // Apply-no-show fallback (Tier 3 with apply): raw apply stdout rendered
  for (const fixture of applyNoShowFixtures) {
    if (!fixture.label.includes("sensitive-values")) continue;
    it(`${fixture.label}: no sensitive values in apply-no-show fallback output`, () => {
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      assertNoSecretLeaks(result, fixture.label);
    });
  }

  // Apply-only (Tier 2): apply without plan output
  for (const fixture of applyOnlyFixtures) {
    if (!fixture.label.includes("sensitive-values")) continue;
    it(`${fixture.label}: no sensitive values in apply-only output`, () => {
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      assertNoSecretLeaks(result, fixture.label);
    });
  }
});
