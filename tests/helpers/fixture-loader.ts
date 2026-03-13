/**
 * Shared helpers for loading fixture data in integration tests.
 *
 * Fixtures live under `tests/fixtures/generated/<tool>/<workspace>/<stage>/`
 * and contain:
 * - `steps.json` — the steps context for the stage
 * - `show-plan.stdout` — plan JSON (terraform show -json output)
 * - `apply.stdout` — apply JSONL output
 * - Various other stdout/stderr files
 *
 * Manual fixtures live under `tests/fixtures/manual/<name>/` and contain
 * a `steps.json` with hand-crafted step data.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const GENERATED_DIR = join(__dirname, "../fixtures/generated");
export const MANUAL_DIR = join(__dirname, "../fixtures/manual");

/** A discovered fixture with the plan JSON string loaded. */
export interface PlanFixture {
  label: string;
  json: string;
}

/** A discovered fixture with plan JSON and apply JSONL strings loaded. */
export interface ApplyFixture {
  label: string;
  planJson: string;
  applyJsonl: string;
}

/** A discovered fixture with the steps.json content and its directory. */
export interface StepsFixture {
  label: string;
  stepsJson: string;
  fixtureDir: string;
}

/**
 * Iterates through all generated fixture stages, calling `visitor` for each
 * stage directory that exists. This avoids duplicating the three-level
 * directory traversal in every discovery function.
 */
function walkGeneratedStages(
  visitor: (stageDir: string, label: string) => void,
): void {
  if (!existsSync(GENERATED_DIR)) return;

  for (const tool of readdirSync(GENERATED_DIR).sort()) {
    const toolDir = join(GENERATED_DIR, tool);
    for (const workspace of readdirSync(toolDir).sort()) {
      const wsDir = join(toolDir, workspace);
      for (const stage of readdirSync(wsDir).sort()) {
        const stageDir = join(wsDir, stage);
        const label = `${tool}/${workspace}/${stage}`;
        visitor(stageDir, label);
      }
    }
  }
}

/**
 * Discovers all plan JSON files (`show-plan.stdout`) across generated fixtures.
 * Returns an array of `{ label, json }` ready for parameterized tests.
 */
export function discoverPlanFixtures(): PlanFixture[] {
  const fixtures: PlanFixture[] = [];

  walkGeneratedStages((stageDir, label) => {
    const planPath = join(stageDir, "show-plan.stdout");
    if (existsSync(planPath)) {
      fixtures.push({
        label,
        json: readFileSync(planPath, "utf-8"),
      });
    }
  });

  return fixtures;
}

/**
 * Discovers all fixture stages that have both `show-plan.stdout` and `apply.stdout`.
 * Returns an array of `{ label, planJson, applyJsonl }` ready for parameterized tests.
 */
export function discoverApplyFixtures(): ApplyFixture[] {
  const fixtures: ApplyFixture[] = [];

  walkGeneratedStages((stageDir, label) => {
    const planPath = join(stageDir, "show-plan.stdout");
    const applyPath = join(stageDir, "apply.stdout");
    if (existsSync(planPath) && existsSync(applyPath)) {
      const applyContent = readFileSync(applyPath, "utf-8");
      // Skip fixtures where apply output is not JSONL (e.g., no-json-flags workspaces)
      if (!applyContent.startsWith("{")) return;
      fixtures.push({
        label,
        planJson: readFileSync(planPath, "utf-8"),
        applyJsonl: applyContent,
      });
    }
  });

  return fixtures;
}

/**
 * Discovers all fixture stages that have a `steps.json` file.
 * Returns the raw steps JSON string and the directory it came from
 * (for use as `allowedDirs`).
 */
export function discoverStepsFixtures(): StepsFixture[] {
  const fixtures: StepsFixture[] = [];

  walkGeneratedStages((stageDir, label) => {
    const stepsPath = join(stageDir, "steps.json");
    if (existsSync(stepsPath)) {
      fixtures.push({
        label,
        stepsJson: readFileSync(stepsPath, "utf-8"),
        fixtureDir: resolve(stageDir),
      });
    }
  });

  return fixtures;
}

/**
 * Discovers manual fixtures (hand-crafted `steps.json` under `tests/fixtures/manual/`).
 */
export function discoverManualStepsFixtures(): StepsFixture[] {
  const fixtures: StepsFixture[] = [];

  if (!existsSync(MANUAL_DIR)) return fixtures;

  for (const name of readdirSync(MANUAL_DIR).sort()) {
    const dir = join(MANUAL_DIR, name);
    const stepsPath = join(dir, "steps.json");
    if (existsSync(stepsPath)) {
      fixtures.push({
        label: `manual/${name}`,
        stepsJson: readFileSync(stepsPath, "utf-8"),
        fixtureDir: resolve(dir),
      });
    }
  }

  return fixtures;
}

/**
 * Resolves relative file paths in a steps.json to absolute paths rooted in
 * the fixture directory. This is needed because `reportFromSteps` expects
 * absolute or RUNNER_TEMP-relative paths, but fixture steps.json files use
 * relative paths (e.g., `"show-plan.stdout"`).
 *
 * Mutates the JSON in-place (string replacement) and returns the updated JSON.
 */
export function resolveStepFilePaths(
  stepsJson: string,
  fixtureDir: string,
): string {
  // Parse, walk, resolve, re-serialize
  const steps = JSON.parse(stepsJson) as Record<
    string,
    {
      outputs?: Record<string, string>;
    }
  >;
  for (const stepData of Object.values(steps)) {
    if (stepData.outputs == null) continue;
    for (const key of ["stdout_file", "stderr_file"]) {
      const val = stepData.outputs[key];
      if (typeof val === "string" && val.length > 0 && !val.startsWith("/")) {
        stepData.outputs[key] = join(fixtureDir, val);
      }
    }
  }
  return JSON.stringify(steps);
}
