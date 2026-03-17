/**
 * End-to-end tests for the render-plan.ts script and reportFromSteps()
 * with manual error fixtures.
 *
 * These tests validate that:
 * 1. The render script produces meaningful HTML output (not empty/stub)
 * 2. reportFromSteps gracefully handles missing files, read errors, parse failures
 * 3. Error information is surfaced in the rendered output
 */
import { execFileSync } from "node:child_process";
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
    execFileSync("npm", ["run", "render", "--", stepsFile, "--no-open"], {
      cwd: PROJECT_ROOT,
      timeout: 30_000,
      stdio: "pipe",
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
    expect(
      existsSync(stepsFile),
      `Fixture missing: ${stepsFile}. Run: bash scripts/generate-fixtures.sh`,
    ).toBe(true);
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
    expect(
      existsSync(stepsFile),
      `Fixture missing: ${stepsFile}. Run: bash scripts/generate-fixtures.sh`,
    ).toBe(true);
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    expect(md).toContain("Apply");
    expect(md).toContain("Resource Changes");
    expect(md.length).toBeGreaterThan(200);
  });

  it("produces meaningful output for a no-op fixture", () => {
    const stepsFile = join(GENERATED_DIR, "terraform/no-op/1/steps.json");
    expect(
      existsSync(stepsFile),
      `Fixture missing: ${stepsFile}. Run: bash scripts/generate-fixtures.sh`,
    ).toBe(true);
    const html = runRender(stepsFile);
    const md = extractMarkdown(html);
    // No-op has an apply step, so it renders as apply complete with no changes
    expect(md).toMatch(/No [Cc]hanges|Apply Complete|_No changes_/);
    expect(md.length).toBeGreaterThan(20);
  });

  it("produces meaningful output for an apply-error fixture", () => {
    const stepsFile = join(GENERATED_DIR, "terraform/apply-error/1/steps.json");
    expect(
      existsSync(stepsFile),
      `Fixture missing: ${stepsFile}. Run: bash scripts/generate-fixtures.sh`,
    ).toBe(true);
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

function requireManualFixture(label: string) {
  const fixture = manualFixtures.find((f) => f.label === label);
  if (fixture == null) {
    throw new Error(
      `Manual fixture "${label}" not found under tests/fixtures/manual/`,
    );
  }
  return fixture;
}

describe("reportFromSteps — manual error fixtures", () => {
  describe("read-errors (absolute paths to nonexistent files)", () => {
    const fixture = requireManualFixture("manual/read-errors");

    it("produces output with error details", () => {
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
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).not.toContain("Showing raw command output");
    });
  });

  describe("missing-outputs (steps without stdout_file/stderr_file)", () => {
    const fixture = requireManualFixture("manual/missing-outputs");

    it("produces output without crashing", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result.length).toBeGreaterThan(50);
    });

    it("shows step statuses since no file output is available", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      expect(result).toContain("Steps");
      expect(result).toContain("show-plan");
    });

    it("reports that no output was available", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        allowedDirs: [fixture.fixtureDir],
        env: NO_GITHUB_ENV,
      });
      // Read errors are shown as standalone warning sections
      expect(result).toContain("stdout_file output missing in steps");
    });
  });

  describe("parse-failure (show-plan.stdout is not valid JSON)", () => {
    const fixture = requireManualFixture("manual/parse-failure");

    it("produces a meaningful error report", () => {
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
    const fixture = requireManualFixture("manual/unrelated-workflow");

    it("produces a general workflow report", () => {
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

  describe("ci-workflow (all steps succeed, workspace + logs URL set)", () => {
    const fixture = requireManualFixture("manual/ci-workflow");
    const LOGS_URL =
      "https://github.com/retailnext/tf-report-action/actions/runs/99999/attempts/1";

    /** Simulate what main.ts does: reportFromSteps output + footer. */
    function buildFullBody(report: string, isPr: boolean): string {
      const footer = isPr
        ? `\n---\n\n[View logs](${LOGS_URL})\n`
        : `\n---\n\n[View logs](${LOGS_URL}) • Last updated: Jan 1, 2026 at 00:00 UTC\n`;
      return report + footer;
    }

    it("contains exactly one logs link in PR context", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        workspace: "ci",
        env: {
          GITHUB_REPOSITORY: "retailnext/tf-report-action",
          GITHUB_RUN_ID: "99999",
          GITHUB_RUN_ATTEMPT: "1",
        },
        allowedDirs: [fixture.fixtureDir],
      });
      const body = buildFullBody(result, true);
      // Count occurrences of the logs URL — catches any link text variant
      const urlCount = body.split(LOGS_URL).length - 1;
      expect(
        urlCount,
        "Expected exactly one logs URL in the full PR comment body",
      ).toBe(1);
    });

    it("contains exactly one logs link in non-PR context", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        workspace: "ci",
        env: {
          GITHUB_REPOSITORY: "retailnext/tf-report-action",
          GITHUB_RUN_ID: "99999",
          GITHUB_RUN_ATTEMPT: "1",
        },
        allowedDirs: [fixture.fixtureDir],
      });
      const body = buildFullBody(result, false);
      const urlCount = body.split(LOGS_URL).length - 1;
      expect(
        urlCount,
        "Expected exactly one logs URL in the full issue comment body",
      ).toBe(1);
    });

    it("uses the canonical link text [View logs]", () => {
      const result = reportFromSteps(fixture.stepsJson, {
        workspace: "ci",
        env: {
          GITHUB_REPOSITORY: "retailnext/tf-report-action",
          GITHUB_RUN_ID: "99999",
          GITHUB_RUN_ATTEMPT: "1",
        },
        allowedDirs: [fixture.fixtureDir],
      });
      expect(result).not.toContain("[View workflow run logs]");
    });
  });
});
