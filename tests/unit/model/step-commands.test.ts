import { describe, it, expect } from "vitest";
import { expectedCommand } from "../../../src/model/step-commands.js";
import type { Tool } from "../../../src/model/report.js";
import type { StepRole } from "../../../src/model/step-commands.js";

describe("expectedCommand", () => {
  const roles: StepRole[] = ["show-plan", "plan", "apply", "validate", "init"];
  const tools: (Tool | undefined)[] = ["tofu", "terraform", undefined];

  it.each(roles)("returns a non-empty string for role '%s' with each tool", (role) => {
    for (const tool of tools) {
      const result = expectedCommand(tool, role);
      expect(result.length).toBeGreaterThan(0);
    }
  });

  describe("with tool = 'tofu'", () => {
    it("returns 'tofu show -json <tfplan>' for show-plan", () => {
      expect(expectedCommand("tofu", "show-plan")).toBe("tofu show -json <tfplan>");
    });

    it("returns 'tofu plan -json -out=<tfplan>' for plan", () => {
      expect(expectedCommand("tofu", "plan")).toBe("tofu plan -json -out=<tfplan>");
    });

    it("returns 'tofu apply -json <tfplan>' for apply", () => {
      expect(expectedCommand("tofu", "apply")).toBe("tofu apply -json <tfplan>");
    });

    it("returns 'tofu validate -json' for validate", () => {
      expect(expectedCommand("tofu", "validate")).toBe("tofu validate -json");
    });

    it("returns 'tofu init -json' for init", () => {
      expect(expectedCommand("tofu", "init")).toBe("tofu init -json");
    });
  });

  describe("with tool = 'terraform'", () => {
    it("returns 'terraform show -json <tfplan>' for show-plan", () => {
      expect(expectedCommand("terraform", "show-plan")).toBe("terraform show -json <tfplan>");
    });

    it("returns 'terraform apply -json <tfplan>' for apply", () => {
      expect(expectedCommand("terraform", "apply")).toBe("terraform apply -json <tfplan>");
    });
  });

  describe("with tool = undefined", () => {
    it("omits tool prefix for show-plan", () => {
      expect(expectedCommand(undefined, "show-plan")).toBe("show -json <tfplan>");
    });

    it("omits tool prefix for plan", () => {
      expect(expectedCommand(undefined, "plan")).toBe("plan -json -out=<tfplan>");
    });

    it("omits tool prefix for apply", () => {
      expect(expectedCommand(undefined, "apply")).toBe("apply -json <tfplan>");
    });

    it("omits tool prefix for validate", () => {
      expect(expectedCommand(undefined, "validate")).toBe("validate -json");
    });

    it("omits tool prefix for init", () => {
      expect(expectedCommand(undefined, "init")).toBe("init -json");
    });
  });
});
