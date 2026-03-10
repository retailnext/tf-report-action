import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";
import { planToMarkdown } from "../../src/index.js";
import type { Options } from "../../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = join(__dirname, "../../tests/fixtures/generated");

/**
 * Discovers all plan.json files under tests/fixtures/generated/<tool>/<workspace>/<stage>/.
 * Returns an array of { label, json } objects ready for parameterized tests.
 *
 * The label encodes tool/workspace/stage so snapshot names are stable across runs.
 */
function discoverFixtures(): { label: string; json: string }[] {
  if (!existsSync(GENERATED_DIR)) {
    return [];
  }

  const fixtures: { label: string; json: string }[] = [];

  for (const tool of readdirSync(GENERATED_DIR).sort()) {
    const toolDir = join(GENERATED_DIR, tool);
    for (const workspace of readdirSync(toolDir).sort()) {
      const wsDir = join(toolDir, workspace);
      for (const stage of readdirSync(wsDir).sort()) {
        const planPath = join(wsDir, stage, "plan.json");
        if (existsSync(planPath)) {
          fixtures.push({
            label: `${String(tool)}/${String(workspace)}/${String(stage)}`,
            json: readFileSync(planPath, "utf-8"),
          });
        }
      }
    }
  }

  return fixtures;
}

const fixtures = discoverFixtures();

// Fail loudly if fixtures are missing — this indicates the generation script
// has not been run, which means integration tests cannot execute.
beforeAll(() => {
  if (fixtures.length === 0) {
    throw new Error(
      "No fixture plan JSON files found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixture-plans.sh",
    );
  }
});

/**
 * Option variants to run for every fixture.
 * Each variant produces a separate snapshot so output differences per option are tracked.
 */
const OPTION_VARIANTS: { name: string; options: Options }[] = [
  { name: "default", options: {} },
  { name: "showUnchangedAttributes", options: { showUnchangedAttributes: true } },
  { name: "diffFormat-simple", options: { diffFormat: "simple" } },
  { name: "summary-template", options: { template: "summary" } },
];

describe("planToMarkdown integration", () => {
  for (const { label, json } of fixtures) {
    describe(label, () => {
      for (const { name, options } of OPTION_VARIANTS) {
        it(`renders without error and matches snapshot [${name}]`, () => {
          const result = planToMarkdown(json, options);
          expect(result).toMatchSnapshot();
        });
      }
    });
  }
});
