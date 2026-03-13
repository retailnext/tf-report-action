import { describe, it, expect, beforeAll } from "vitest";
import { reportFromSteps } from "../../src/index.js";
import type { ReportOptions } from "../../src/index.js";
import {
  discoverStepsFixtures,
  discoverPlanStepsFixtures,
  discoverNoShowStepsFixtures,
  discoverManualStepsFixtures,
  resolveStepFilePaths,
} from "../helpers/fixture-loader.js";

// ---------- Generated fixtures (full workflow — Tier 1 with apply) ----------

const generatedFixtures = discoverStepsFixtures();
const planOnlyFixtures = discoverPlanStepsFixtures();
const noShowFixtures = discoverNoShowStepsFixtures();

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

// ---------- Plan-only fixtures (Tier 1 without apply) ----------

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
        expect(result).toMatch(/Plan Summary|No Changes|Plan Output|Plan|No readable output/);
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
      });

      it("produces Tier 3 output (no Plan Summary)", () => {
        const resolved = resolveStepFilePaths(stepsJson, fixtureDir);
        const options: ReportOptions = {
          allowedDirs: [fixtureDir],
          env: NO_GITHUB_ENV,
        };
        const result = reportFromSteps(resolved, options);
        // Tier 3 does not produce structured "Plan Summary"
        expect(result).not.toContain("Plan Summary");
        // Should have either raw command output or a note about unavailable output
        expect(result).toMatch(/raw command output|No readable output/);
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
      });
    });
  }
});

// ---------- Targeted assertions — error fixtures ----------

describe("reportFromSteps integration — error fixture scenarios", () => {
  it("validate-error: renders failed validate with error details", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("validate-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show the failed validate step
    expect(result).toContain("`validate` failed");
    // Should show failure icon
    expect(result).toContain("❌");
  });

  it("validate-error: with workspace shows workspace in title", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("validate-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      workspace: "my-ws",
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("`my-ws`");
    expect(result).toContain("❌");
  });

  it("plan-error: renders failed plan with stdout", () => {
    const fixture = generatedFixtures.find((f) =>
      f.label.includes("plan-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show failure icon
    expect(result).toContain("❌");
    // Should have plan output (Tier 3 with readable plan stdout)
    expect(result).toContain("Plan Output");
  });

  it("plan-error: plan-only variant shows plan failure without apply", () => {
    const fixture = planOnlyFixtures.find((f) =>
      f.label.includes("plan-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("❌");
    expect(result).not.toContain("Apply");
  });

  it("validate-error: no-show variant exercises Tier 3 no-output path", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("validate-error/1"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Validate failed, plan was skipped (no stdout_file) → Tier 3 with no readable output
    expect(result).toContain("`validate` failed");
    // Should show step status table since no output is available
    expect(result).toContain("| Step | Outcome |");
  });

  it("no-show fixture with readable plan stdout shows raw output", () => {
    // Pick a normal (non-error) fixture's no-show variant
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("null-lifecycle") && !f.label.includes("0/"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    });
    // Should show raw command output note
    expect(result).toContain("raw command output");
    expect(result).toContain("Plan Output");
  });

  it("no-show fixture under budget pressure truncates output", () => {
    const fixture = noShowFixtures.find((f) =>
      f.label.includes("null-lifecycle"),
    );
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
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
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const result = reportFromSteps(resolved, {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 500,
      env: {
        GITHUB_REPOSITORY: "owner/repo",
        GITHUB_RUN_ID: "99999",
        GITHUB_RUN_ATTEMPT: "2",
      },
    });
    expect(result).toContain("https://github.com/owner/repo/actions/runs/99999/attempts/2");
  });
});

// ---------- Targeted assertions — general scenarios ----------

describe("reportFromSteps integration — targeted scenarios", () => {
  it("includes logs URL when GitHub env vars are set and output is truncated", () => {
    const fixture = generatedFixtures[0];
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
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
    expect(result).toContain("https://github.com/owner/repo/actions/runs/12345/attempts/1");
  });

  it("includes workspace dedup marker when workspace is set", () => {
    const fixture = generatedFixtures[0];
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
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
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      maxOutputLength: 500,
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("produces Tier 1 report for fixtures with show-plan.stdout", () => {
    const fixture = generatedFixtures.find((f) => f.label.includes("null-lifecycle"));
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain("Plan Summary");
  });

  it("uses apply titles for apply fixtures", () => {
    const fixture = generatedFixtures.find(
      (f) => f.label.includes("null-lifecycle") && f.label.endsWith("/2"),
    );
    if (fixture == null) return;
    const resolved = resolveStepFilePaths(fixture.stepsJson, fixture.fixtureDir);
    const options: ReportOptions = {
      allowedDirs: [fixture.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    expect(result).toContain("Apply");
  });

  it("shows error details for apply-error fixtures", () => {
    const fixture = generatedFixtures.find(
      (f) => f.label.includes("apply-error/1"),
    );
    if (fixture == null) return;
    const resolved = resolveStepFilePaths(fixture.stepsJson, fixture.fixtureDir);
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
