import { describe, it, expect, beforeAll } from "vitest";
import { planToMarkdown } from "../../src/index.js";
import type { Options } from "../../src/index.js";
import { discoverPlanFixtures } from "../helpers/fixture-loader.js";

const fixtures = discoverPlanFixtures();

// Fail loudly if fixtures are missing — this indicates the generation script
// has not been run, which means integration tests cannot execute.
beforeAll(() => {
  if (fixtures.length === 0) {
    throw new Error(
      "No fixture plan JSON files found under tests/fixtures/generated/. " +
        "Run: bash scripts/generate-fixtures.sh",
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
