import { describe, it, expect } from "vitest";
import {
  isStepResult,
  DEFAULT_INIT_STEP,
  DEFAULT_VALIDATE_STEP,
  DEFAULT_PLAN_STEP,
  DEFAULT_SHOW_PLAN_STEP,
  DEFAULT_APPLY_STEP,
  DEFAULT_STATE_STEP,
  DEFAULT_KNOWN_STEP_IDS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_DISPLAY_READ,
  OUTPUT_STDOUT_FILE,
  OUTPUT_STDERR_FILE,
  OUTPUT_EXIT_CODE,
} from "../../../src/steps/types.js";

describe("isStepResult", () => {
  it.each(["success", "failure", "cancelled", "skipped"])(
    "returns true for %s",
    (value) => {
      expect(isStepResult(value)).toBe(true);
    },
  );

  it.each(["neutral", "unknown", "", "SUCCESS", "Success"])(
    "returns false for %s",
    (value) => {
      expect(isStepResult(value)).toBe(false);
    },
  );
});

describe("default step IDs", () => {
  it("has expected values", () => {
    expect(DEFAULT_INIT_STEP).toBe("init");
    expect(DEFAULT_VALIDATE_STEP).toBe("validate");
    expect(DEFAULT_PLAN_STEP).toBe("plan");
    expect(DEFAULT_SHOW_PLAN_STEP).toBe("show-plan");
    expect(DEFAULT_APPLY_STEP).toBe("apply");
    expect(DEFAULT_STATE_STEP).toBe("state");
  });

  it("DEFAULT_KNOWN_STEP_IDS contains all defaults", () => {
    expect(DEFAULT_KNOWN_STEP_IDS.has("init")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.has("validate")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.has("plan")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.has("show-plan")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.has("apply")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.has("state")).toBe(true);
    expect(DEFAULT_KNOWN_STEP_IDS.size).toBe(6);
  });
});

describe("constants", () => {
  it("DEFAULT_MAX_FILE_SIZE is 256 MiB", () => {
    expect(DEFAULT_MAX_FILE_SIZE).toBe(256 * 1024 * 1024);
  });

  it("DEFAULT_MAX_DISPLAY_READ is 64 KiB", () => {
    expect(DEFAULT_MAX_DISPLAY_READ).toBe(64 * 1024);
  });

  it("output keys match exec-action convention", () => {
    expect(OUTPUT_STDOUT_FILE).toBe("stdout_file");
    expect(OUTPUT_STDERR_FILE).toBe("stderr_file");
    expect(OUTPUT_EXIT_CODE).toBe("exit_code");
  });
});
