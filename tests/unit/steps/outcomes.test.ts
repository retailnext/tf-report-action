import { describe, it, expect } from "vitest";
import {
  getStepOutcome,
  hasAnyFailedStep,
  hasAnyFailedKnownStep,
  buildStepOutcomes,
} from "../../../src/steps/outcomes.js";
import type { StepData, Steps } from "../../../src/steps/types.js";

describe("getStepOutcome", () => {
  it("prefers outcome over conclusion", () => {
    const step: StepData = { outcome: "failure", conclusion: "success" };
    expect(getStepOutcome(step)).toBe("failure");
  });

  it("falls back to conclusion when outcome is not set", () => {
    const step: StepData = { conclusion: "cancelled" };
    expect(getStepOutcome(step)).toBe("cancelled");
  });

  it('returns "unknown" when neither outcome nor conclusion is set', () => {
    const step: StepData = {};
    expect(getStepOutcome(step)).toBe("unknown");
  });

  it("returns outcome when conclusion is not set", () => {
    const step: StepData = { outcome: "skipped" };
    expect(getStepOutcome(step)).toBe("skipped");
  });
});

describe("hasAnyFailedStep", () => {
  const knownIds = new Set(["init", "plan"]);

  it("returns true when a step outside known IDs has failed", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      lint: { outcome: "failure" },
    };
    expect(hasAnyFailedStep(steps, knownIds)).toBe(true);
  });

  it("returns false when only known steps have failed", () => {
    const steps: Steps = {
      init: { outcome: "failure" },
      plan: { outcome: "failure" },
    };
    expect(hasAnyFailedStep(steps, knownIds)).toBe(false);
  });

  it("returns false when no steps have failed", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      lint: { outcome: "success" },
    };
    expect(hasAnyFailedStep(steps, knownIds)).toBe(false);
  });

  it("returns false for empty steps", () => {
    expect(hasAnyFailedStep({}, knownIds)).toBe(false);
  });
});

describe("hasAnyFailedKnownStep", () => {
  const knownIds = new Set(["init", "plan"]);

  it("returns true when a known step has failed", () => {
    const steps: Steps = {
      init: { outcome: "failure" },
      lint: { outcome: "success" },
    };
    expect(hasAnyFailedKnownStep(steps, knownIds)).toBe(true);
  });

  it("returns false when only unknown steps have failed", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      lint: { outcome: "failure" },
    };
    expect(hasAnyFailedKnownStep(steps, knownIds)).toBe(false);
  });

  it("returns false when no steps have failed", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      plan: { outcome: "success" },
    };
    expect(hasAnyFailedKnownStep(steps, knownIds)).toBe(false);
  });

  it("returns false for empty steps", () => {
    expect(hasAnyFailedKnownStep({}, knownIds)).toBe(false);
  });
});

describe("buildStepOutcomes", () => {
  it("returns an array of { id, outcome } from the steps record", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      plan: { outcome: "failure" },
    };
    const result = buildStepOutcomes(steps);
    expect(result).toEqual([
      { id: "init", outcome: "success" },
      { id: "plan", outcome: "failure" },
    ]);
  });

  it("excludes IDs present in excludeIds set", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      plan: { outcome: "failure" },
      lint: { outcome: "success" },
    };
    const result = buildStepOutcomes(steps, new Set(["plan"]));
    expect(result).toEqual([
      { id: "init", outcome: "success" },
      { id: "lint", outcome: "success" },
    ]);
  });

  it("returns empty array for empty steps", () => {
    expect(buildStepOutcomes({})).toEqual([]);
  });

  it("uses getStepOutcome logic (prefers outcome, falls back to conclusion)", () => {
    const steps: Steps = {
      a: { conclusion: "cancelled" },
      b: {},
    };
    const result = buildStepOutcomes(steps);
    expect(result).toEqual([
      { id: "a", outcome: "cancelled" },
      { id: "b", outcome: "unknown" },
    ]);
  });

  it("returns all steps when excludeIds is undefined", () => {
    const steps: Steps = {
      init: { outcome: "success" },
      plan: { outcome: "success" },
    };
    const result = buildStepOutcomes(steps);
    expect(result).toHaveLength(2);
  });
});
