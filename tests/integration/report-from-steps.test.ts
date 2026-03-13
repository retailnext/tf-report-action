import { describe, it, expect, beforeAll } from "vitest";
import { reportFromSteps } from "../../src/index.js";
import type { ReportOptions } from "../../src/index.js";
import {
  discoverStepsFixtures,
  discoverManualStepsFixtures,
  resolveStepFilePaths,
} from "../helpers/fixture-loader.js";

// ---------- Generated fixtures (Tier 1/2/3) ----------

const generatedFixtures = discoverStepsFixtures();

beforeAll(() => {
  if (generatedFixtures.length === 0) {
    throw new Error(
      "No steps.json fixtures found under tests/fixtures/generated/. " +
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

// ---------- Manual fixtures (Tier 4) ----------

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

// ---------- Targeted assertions ----------

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
    // Pick a fixture that has show-plan.stdout (most generated fixtures do)
    const fixture = generatedFixtures.find((f) => f.label.includes("null-lifecycle"));
    expect(fixture).toBeDefined();
    const resolved = resolveStepFilePaths(fixture!.stepsJson, fixture!.fixtureDir);
    const options: ReportOptions = {
      allowedDirs: [fixture!.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    // Tier 1 reports have structured content: Plan Summary or resource details
    expect(result).toContain("Plan Summary");
  });

  it("uses apply titles for apply fixtures", () => {
    // Find a fixture that has apply data (most do)
    const fixture = generatedFixtures.find(
      (f) => f.label.includes("null-lifecycle") && f.label.endsWith("/2"),
    );
    if (fixture == null) return; // Skip if fixture unavailable
    const resolved = resolveStepFilePaths(fixture.stepsJson, fixture.fixtureDir);
    const options: ReportOptions = {
      allowedDirs: [fixture.fixtureDir],
      env: NO_GITHUB_ENV,
    };
    const result = reportFromSteps(resolved, options);
    // Apply fixtures should have apply content
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
