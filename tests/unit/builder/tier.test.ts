import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectTier } from "../../../src/builder/tier.js";
import type { StepData, ReaderOptions } from "../../../src/steps/types.js";

const tempDir = mkdtempSync(join(tmpdir(), "tier-test-"));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

const opts: ReaderOptions = {
  allowedDirs: [tempDir],
  maxFileSize: 1024,
  maxDisplayRead: 64,
};

describe("detectTier", () => {
  it("returns tier1 when show-plan step succeeds and stdout is readable", () => {
    const stdoutPath = writeFixture("show-plan-stdout.json", '{"format_version":"1.2"}');
    const showPlanStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: stdoutPath },
    };

    const tier = detectTier(showPlanStep, undefined, undefined, opts);
    expect(tier).toEqual({
      kind: "tier1",
      showPlanJson: '{"format_version":"1.2"}',
    });
  });

  it("falls back from tier1 to tier3 when stdout read fails (no stdout_file)", () => {
    const showPlanStep: StepData = { outcome: "success" };
    const planStdout = writeFixture("plan-stdout-fallback.txt", "plan output");
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: planStdout },
    };

    const tier = detectTier(showPlanStep, planStep, undefined, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.readErrors.length).toBeGreaterThan(0);
      expect(tier.planRead?.content).toBe("plan output");
    }
  });

  it("falls back from tier1 to tier4 when stdout read fails and no plan/apply steps", () => {
    const showPlanStep: StepData = { outcome: "success" };
    const tier = detectTier(showPlanStep, undefined, undefined, opts);
    // No plan/apply → tier4 is not reached because show-plan has no file → readError pushed,
    // but since no plan/apply steps exist, we still need tier4
    // Actually: show-plan fails read → readErrors pushed, then falls through to tier3 check
    // planStep and applyStep are both undefined → skips tier3 → returns tier4
    expect(tier.kind).toBe("tier4");
  });

  it("returns tier3 when no show-plan but plan step exists", () => {
    const planStdout = writeFixture("plan-stdout.txt", "Terraform plan output");
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: planStdout },
    };

    const tier = detectTier(undefined, planStep, undefined, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.planRead?.content).toBe("Terraform plan output");
      expect(tier.readErrors).toEqual([]);
    }
  });

  it("returns tier3 when no show-plan but apply step exists", () => {
    const applyStdout = writeFixture("apply-stdout.txt", "Apply complete!");
    const applyStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: applyStdout },
    };

    const tier = detectTier(undefined, undefined, applyStep, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.applyRead?.content).toBe("Apply complete!");
      expect(tier.readErrors).toEqual([]);
    }
  });

  it("returns tier3 with both plan and apply reads when both steps exist", () => {
    const planStdout = writeFixture("tier3-plan.txt", "plan output");
    const applyStdout = writeFixture("tier3-apply.txt", "apply output");
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: planStdout },
    };
    const applyStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: applyStdout },
    };

    const tier = detectTier(undefined, planStep, applyStep, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.planRead?.content).toBe("plan output");
      expect(tier.applyRead?.content).toBe("apply output");
    }
  });

  it("skips apply read when apply step outcome is skipped", () => {
    const planStdout = writeFixture("tier3-plan-skipped.txt", "plan output");
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: planStdout },
    };
    const applyStep: StepData = { outcome: "skipped" };

    const tier = detectTier(undefined, planStep, applyStep, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.planRead?.content).toBe("plan output");
      expect(tier.applyRead).toBeUndefined();
    }
  });

  it("returns tier4 when no plan or apply steps are present", () => {
    const tier = detectTier(undefined, undefined, undefined, opts);
    expect(tier).toEqual({ kind: "tier4" });
  });

  it("skips tier1 when show-plan outcome is failure", () => {
    const showPlanStep: StepData = { outcome: "failure" };
    const planStdout = writeFixture("plan-after-fail.txt", "plan output");
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: planStdout },
    };

    const tier = detectTier(showPlanStep, planStep, undefined, opts);
    expect(tier.kind).toBe("tier3");
  });

  it("collects read errors when plan stdout file does not exist", () => {
    const planStep: StepData = {
      outcome: "success",
      outputs: { stdout_file: join(tempDir, "nonexistent.txt") },
    };

    const tier = detectTier(undefined, planStep, undefined, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.readErrors.length).toBeGreaterThan(0);
      expect(tier.readErrors[0]).toContain("plan stdout:");
    }
  });

  it("collects noFile warning when plan step has no stdout_file output", () => {
    const planStep: StepData = { outcome: "success" };

    const tier = detectTier(undefined, planStep, undefined, opts);
    expect(tier.kind).toBe("tier3");
    if (tier.kind === "tier3") {
      expect(tier.readErrors.length).toBeGreaterThan(0);
      expect(tier.readErrors[0]).toContain("stdout_file output missing");
    }
  });
});
