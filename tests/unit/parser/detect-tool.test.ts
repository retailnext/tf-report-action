import { describe, it, expect } from "vitest";
import {
  detectToolFromPlan,
  detectToolFromOutput,
} from "../../../src/parser/detect-tool.js";
import type { Plan } from "../../../src/tfjson/plan.js";

/** Minimal plan object with only the fields needed for tool detection. */
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    format_version: "1.2",
    ...overrides,
  } as Plan;
}

describe("detectToolFromPlan", () => {
  it("returns 'tofu' when timestamp is present", () => {
    const plan = makePlan({ timestamp: "2024-01-01T00:00:00Z" });
    expect(detectToolFromPlan(plan)).toBe("tofu");
  });

  it("returns 'terraform' when applyable is present", () => {
    const plan = makePlan({ applyable: true });
    expect(detectToolFromPlan(plan)).toBe("terraform");
  });

  it("returns 'tofu' when timestamp takes priority over version string", () => {
    const plan = makePlan({
      timestamp: "2024-01-01T00:00:00Z",
      terraform_version: "1.7.0",
    });
    expect(detectToolFromPlan(plan)).toBe("tofu");
  });

  it("returns 'terraform' when both applyable and timestamp are present", () => {
    const plan = makePlan({
      applyable: true,
      timestamp: "2024-01-01T00:00:00Z",
    });
    expect(detectToolFromPlan(plan)).toBe("terraform");
  });

  it("returns 'tofu' when terraform_version contains 'tofu'", () => {
    const plan = makePlan({ terraform_version: "1.8.0-dev+tofu" });
    expect(detectToolFromPlan(plan)).toBe("tofu");
  });

  it("returns undefined when neither marker is present and version is generic", () => {
    const plan = makePlan({ terraform_version: "1.9.0" });
    expect(detectToolFromPlan(plan)).toBeUndefined();
  });

  it("returns undefined when plan has no distinguishing fields", () => {
    const plan = makePlan();
    expect(detectToolFromPlan(plan)).toBeUndefined();
  });
});

describe("detectToolFromOutput", () => {
  describe("JSONL version message detection", () => {
    it("returns 'tofu' from a version message with tofu field", () => {
      const content =
        '{"@level":"info","@message":"OpenTofu 1.8.0","@module":"tofu.ui","@timestamp":"2024-01-01T00:00:00Z","type":"version","tofu":"1.8.0","ui":"1.2"}\n';
      expect(detectToolFromOutput(content)).toBe("tofu");
    });

    it("returns 'terraform' from a version message with terraform field", () => {
      const content =
        '{"@level":"info","@message":"Terraform v1.9.0","@module":"terraform.ui","@timestamp":"2024-01-01T00:00:00Z","type":"version","terraform":"1.9.0","ui":"1.2"}\n';
      expect(detectToolFromOutput(content)).toBe("terraform");
    });

    it("detects tool from version message even with preceding blank lines", () => {
      const content =
        '\n\n{"@level":"info","@message":"OpenTofu 1.8.0","@module":"tofu.ui","@timestamp":"2024-01-01T00:00:00Z","type":"version","tofu":"1.8.0","ui":"1.2"}\n';
      expect(detectToolFromOutput(content)).toBe("tofu");
    });

    it("prefers JSONL detection over raw text detection", () => {
      const content =
        '{"@level":"info","@message":"Terraform v1.9.0","type":"version","terraform":"1.9.0","ui":"1.2"}\n{"type":"log","@message":"OpenTofu is great"}\n';
      expect(detectToolFromOutput(content)).toBe("terraform");
    });
  });

  describe("raw text detection", () => {
    it("returns 'tofu' when output contains 'OpenTofu'", () => {
      const content = "OpenTofu v1.8.0\nInitializing...\n";
      expect(detectToolFromOutput(content)).toBe("tofu");
    });

    it("returns 'terraform' when output contains 'Terraform'", () => {
      const content = "Terraform v1.9.0\nInitializing...\n";
      expect(detectToolFromOutput(content)).toBe("terraform");
    });

    it("returns 'tofu' when output contains 'opentofu' (case insensitive)", () => {
      const content = "OPENTOFU v1.8.0\nSome output\n";
      expect(detectToolFromOutput(content)).toBe("tofu");
    });

    it("returns 'terraform' when output contains 'terraform' (case insensitive)", () => {
      const content = "terraform plan output\nPlan: 1 to add\n";
      expect(detectToolFromOutput(content)).toBe("terraform");
    });
  });

  describe("edge cases", () => {
    it("returns undefined for undefined content", () => {
      expect(detectToolFromOutput(undefined)).toBeUndefined();
    });

    it("returns undefined for empty content", () => {
      expect(detectToolFromOutput("")).toBeUndefined();
    });

    it("returns undefined when content has no tool indicators", () => {
      const content = "Plan: 1 to add, 0 to change, 0 to destroy.\n";
      expect(detectToolFromOutput(content)).toBeUndefined();
    });

    it("returns undefined when JSON is present but not a version message", () => {
      const content = '{"type":"log","@message":"doing stuff"}\n';
      expect(detectToolFromOutput(content)).toBeUndefined();
    });

    it("handles malformed JSON gracefully", () => {
      const content = '{broken json\n{"type":"version","tofu":"1.8.0"}\n';
      expect(detectToolFromOutput(content)).toBe("tofu");
    });
  });
});
