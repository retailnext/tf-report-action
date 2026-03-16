/**
 * End-to-end tests for the render-plan.ts script and reportFromSteps()
 * with manual error fixtures.
 *
 * These tests validate that:
 * 1. The render script produces meaningful HTML output (not empty/stub)
 * 2. reportFromSteps gracefully handles missing files, read errors, parse failures
 * 3. Error information is surfaced in the rendered output
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { reportFromSteps } from "../../src/index.js";
import {
  discoverManualStepsFixtures,
  resolveStepFilePaths,
} from "../helpers/fixture-loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");
const GENERATED_DIR = join(PROJECT_ROOT, "tests/fixtures/generated");

/** Env with no GitHub vars — suppresses logs URL. */
const NO_GITHUB_ENV = { HOME: "/tmp" };

// ---------------------------------------------------------------------------
// Render-plan.ts E2E tests
// ---------------------------------------------------------------------------

describe("render-plan.ts E2E", () => {
  /**
   * Run the render script and return the HTML content from the output file.
   */
  function runRender(stepsFile: string): string {
    const htmlPath = "/tmp/tf-plan-preview.html";
    const cmd = `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run render -- --steps ${stepsFile} --no-open 2>&1`;
    execSync(cmd, {
      cwd: PROJECT_ROOT,
      timeout: 30_000,
    });
    expect(existsSync(htmlPath)).toBe(true);
    return readFileSync(htmlPath, "utf-8");
  }

  /**
   * Extract the markdown string from the HTML template.
   * The render script embeds it as a template literal: const markdown = `...`;
   */
  function extractMarkdown(html: string): string {
    const match = /const markdown = `([\s\S]*?)`;/.exec(html);
    expect(match).toBeTruthy();
    return match![1]!;
  }

  it("produces meaningful output for a normal plan fixture", () => {
    const stepsFile = join(
      GENERATED_DIR,
      "terraform/null-lifecycle/1/steps.json",
    );
    if (!existsSync(stepsFile)) return;
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    // Should have structured content, not empty/stub
    expect(md).toContain("Summary");
    expect(md).toContain("Resource Changes");
    expect(md.length).toBeGreaterThan(200);
  });

  it("produces meaningful output for an apply fixture", () => {
    const stepsFile = join(
      GENERATED_DIR,
      "terraform/null-lifecycle/2/steps.json",
    );
    if (!existsSync(stepsFile)) return;
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    expect(md).toContain("Apply");
    expect(md).toContain("Resource Changes");
    expect(md.length).toBeGreaterThan(200);
  });

  it("produces meaningful output for a no-op fixture", () => {
    const stepsFile = join(GENERATED_DIR, "terraform/no-op/1/steps.json");
    if (!existsSync(stepsFile)) return;
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    // No-op has an apply step, so it renders as apply complete with no changes
    expect(md).toMatch(/No [Cc]hanges|Apply Complete|_No changes_/);
    expect(md.length).toBeGreaterThan(20);
  });

  it("produces meaningful output for an apply-error fixture", () => {
    const stepsFile = join(GENERATED_DIR, "terraform/apply-error/1/steps.json");
    if (!existsSync(stepsFile)) return;
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    expect(md).toContain("Apply");
    expect(md).toContain("will_fail");
    expect(md.length).toBeGreaterThan(200);
  });
});

// ---------------------------------------------------------------------------
// Manual fixture tests — error scenarios via reportFromSteps()
// ---------------------------------------------------------------------------

const manualFixtures = discoverManualStepsFixtures();

describe("reportFromSteps — manual error fixtures", () => {
  describe("read-errors (absolute paths to nonexistent files)", () => {
    const fixture = manualFixtures.find(
      (f) => f.label === "manual/read-errors",
    );

    it("produces output with error details", () => {
      if (!fixture) return;
      // Don't resolve paths — they are absolute /nonexistent/... paths intentionally
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result.length).toBeGreaterThan(50);
      // Should explain why output wasn't available
      expect(result).toMatch(
        /not (found|accessible)|not in an allowed directory/i,
      );
    });

    it("shows step statuses when output is not readable", () => {
      if (!fixture) return;
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      // Should show step outcomes
      expect(result).toContain("Steps");
      expect(result).toContain("show-plan");
      expect(result).toContain("success");
    });

    it("does not say 'Showing raw command output' when there is none", () => {
      if (!fixture) return;
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).not.toContain("Showing raw command output");
    });
  });

  describe("missing-outputs (steps without stdout_file/stderr_file)", () => {
    const fixture = manualFixtures.find(
      (f) => f.label === "manual/missing-outputs",
    );

    it("produces output without crashing", () => {
      if (!fixture) return;
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result.length).toBeGreaterThan(50);
    });

    it("shows step statuses since no file output is available", () => {
      if (!fixture) return;
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).toContain("Steps");
      expect(result).toContain("show-plan");
    });

    it("reports that no output was available", () => {
      if (!fixture) return;
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      // Read errors are shown as standalone warning sections
      expect(result).toContain("stdout_file output missing in steps");
    });
  });

  describe("parse-failure (show-plan.stdout is not valid JSON)", () => {
    const fixture = manualFixtures.find(
      (f) => f.label === "manual/parse-failure",
    );

    it("produces a meaningful error report", () => {
      if (!fixture) return;
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result.length).toBeGreaterThan(50);
      // Should indicate a processing error
      expect(result).toMatch(/error|fail/i);
    });
  });

  describe("unrelated-workflow (no IaC steps at all)", () => {
    const fixture = manualFixtures.find(
      (f) => f.label === "manual/unrelated-workflow",
    );

    it("produces a general workflow report", () => {
      if (!fixture) return;
      const resolved = resolveStepFilePaths(
        fixture.stepsJson,
        fixture.fixtureDir,
      );
      const result = reportFromSteps(resolved, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result.length).toBeGreaterThan(20);
      // Should list the steps it found
      expect(result).toContain("Step");
      expect(result).toContain("Outcome");
    });
  });
});

// ---------------------------------------------------------------------------
// Relative path rejection in reportFromSteps
// ---------------------------------------------------------------------------

describe("reportFromSteps — relative path handling", () => {
  it("reports errors for relative stdout_file paths (not silently empty)", () => {
    // Raw steps.json with relative paths and no resolution — includes plan
    // step so that it enters Tier 3 (not Tier 4)
    const stepsJson = JSON.stringify({
      plan: {
        outcome: "success",
        conclusion: "success",
        outputs: {
          exit_code: "2",
          stdout_file: "plan.stdout",
        },
      },
      "show-plan": {
        outcome: "success",
        conclusion: "success",
        outputs: {
          exit_code: "0",
          stdout_file: "show-plan.stdout",
        },
      },
    });
    const result = reportFromSteps(stepsJson, {
      allowedDirs: ["/tmp"],
      env: NO_GITHUB_ENV,
    });
    // Should NOT silently produce empty content — should explain the error
    expect(result).toMatch(/[Rr]elative file path/);
    expect(result).not.toContain("Showing raw command output");
  });

  it("shows step statuses when file reads fail due to relative paths", () => {
    const stepsJson = JSON.stringify({
      plan: {
        outcome: "success",
        conclusion: "success",
        outputs: { exit_code: "2", stdout_file: "plan.stdout" },
      },
      "show-plan": {
        outcome: "success",
        conclusion: "success",
        outputs: { exit_code: "0", stdout_file: "show-plan.stdout" },
      },
    });
    const result = reportFromSteps(stepsJson, {
      allowedDirs: ["/tmp"],
      env: NO_GITHUB_ENV,
    });
    expect(result).toContain("Steps");
    expect(result).toContain("show-plan");
    expect(result).toContain("plan");
  });
});
