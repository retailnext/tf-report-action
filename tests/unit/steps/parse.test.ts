import { describe, it, expect } from "vitest";
import { parseSteps } from "../../../src/steps/parse.js";

describe("parseSteps", () => {
  describe("valid inputs", () => {
    it("parses an empty steps context", () => {
      const result = parseSteps("{}");
      expect(result).toEqual({});
    });

    it("parses a minimal step with outcome and conclusion", () => {
      const json = JSON.stringify({
        build: {
          outcome: "success",
          conclusion: "success",
          outputs: {},
        },
      });
      const result = parseSteps(json);
      expect(result["build"]).toEqual({
        outcome: "success",
        conclusion: "success",
        outputs: {},
      });
    });

    it("parses exec-action step outputs", () => {
      const json = JSON.stringify({
        plan: {
          outcome: "success",
          conclusion: "success",
          outputs: {
            stdout_file: "/tmp/plan.stdout",
            stderr_file: "/tmp/plan.stderr",
            exit_code: "2",
          },
        },
      });
      const result = parseSteps(json);
      const outputs = result["plan"]?.outputs;
      expect(outputs?.["stdout_file"]).toBe("/tmp/plan.stdout");
      expect(outputs?.["stderr_file"]).toBe("/tmp/plan.stderr");
      expect(outputs?.["exit_code"]).toBe("2");
    });

    it("parses multiple steps", () => {
      const json = JSON.stringify({
        init: { outcome: "success", conclusion: "success", outputs: {} },
        plan: { outcome: "failure", conclusion: "failure", outputs: { exit_code: "1" } },
        apply: { outcome: "skipped", conclusion: "skipped" },
      });
      const result = parseSteps(json);
      expect(Object.keys(result)).toEqual(["init", "plan", "apply"]);
      expect(result["plan"]?.outcome).toBe("failure");
      expect(result["apply"]?.outcome).toBe("skipped");
    });

    it("accepts steps with missing optional fields", () => {
      const json = JSON.stringify({
        build: {},
      });
      const result = parseSteps(json);
      expect(result["build"]).toEqual({});
      expect(result["build"]?.outcome).toBeUndefined();
      expect(result["build"]?.conclusion).toBeUndefined();
      expect(result["build"]?.outputs).toBeUndefined();
    });

    it("accepts null outcome/conclusion as undefined", () => {
      const json = JSON.stringify({
        build: { outcome: null, conclusion: null, outputs: null },
      });
      const result = parseSteps(json);
      expect(result["build"]?.outcome).toBeUndefined();
      expect(result["build"]?.conclusion).toBeUndefined();
      expect(result["build"]?.outputs).toBeUndefined();
    });

    it("silently drops non-string output values", () => {
      const json = JSON.stringify({
        build: {
          outcome: "success",
          outputs: {
            good: "value",
            number: 42,
            boolean: true,
            object: { nested: true },
            array: [1, 2],
          },
        },
      });
      const result = parseSteps(json);
      const outputs = result["build"]?.outputs;
      expect(outputs?.["good"]).toBe("value");
      expect(outputs?.["number"]).toBeUndefined();
      expect(outputs?.["boolean"]).toBeUndefined();
      expect(outputs?.["object"]).toBeUndefined();
      expect(outputs?.["array"]).toBeUndefined();
    });

    it("preserves unknown outcome strings", () => {
      const json = JSON.stringify({
        build: { outcome: "neutral", conclusion: "neutral" },
      });
      const result = parseSteps(json);
      expect(result["build"]?.outcome).toBe("neutral");
      expect(result["build"]?.conclusion).toBe("neutral");
    });

    it("preserves unknown step properties without error", () => {
      const json = JSON.stringify({
        build: {
          outcome: "success",
          conclusion: "success",
          outputs: {},
          unknown_field: "value",
        },
      });
      // Should not throw
      const result = parseSteps(json);
      expect(result["build"]?.outcome).toBe("success");
    });
  });

  describe("invalid inputs", () => {
    it("throws on invalid JSON", () => {
      expect(() => parseSteps("not json")).toThrow(
        "Steps context is not valid JSON",
      );
    });

    it("throws on JSON array", () => {
      expect(() => parseSteps("[]")).toThrow(
        "Steps context must be a JSON object",
      );
    });

    it("throws on JSON string", () => {
      expect(() => parseSteps('"hello"')).toThrow(
        "Steps context must be a JSON object",
      );
    });

    it("throws on JSON number", () => {
      expect(() => parseSteps("42")).toThrow(
        "Steps context must be a JSON object",
      );
    });

    it("throws on JSON null", () => {
      expect(() => parseSteps("null")).toThrow(
        "Steps context must be a JSON object",
      );
    });

    it("throws when step value is not an object", () => {
      expect(() => parseSteps('{"build": "string"}')).toThrow(
        'Steps context: step "build" must be an object',
      );
    });

    it("throws when step value is an array", () => {
      expect(() => parseSteps('{"build": []}')).toThrow(
        'Steps context: step "build" must be an object',
      );
    });

    it("throws when step value is null", () => {
      expect(() => parseSteps('{"build": null}')).toThrow(
        'Steps context: step "build" must be an object',
      );
    });

    it("throws when outcome is not a string", () => {
      expect(() => parseSteps('{"build": {"outcome": 42}}')).toThrow(
        'Steps context: step "build" field "outcome" must be a string',
      );
    });

    it("throws when conclusion is not a string", () => {
      expect(() =>
        parseSteps('{"build": {"conclusion": true}}'),
      ).toThrow(
        'Steps context: step "build" field "conclusion" must be a string',
      );
    });

    it("throws when outputs is not an object", () => {
      expect(() =>
        parseSteps('{"build": {"outputs": "string"}}'),
      ).toThrow(
        'Steps context: step "build" field "outputs" must be an object',
      );
    });

    it("throws when outputs is an array", () => {
      expect(() => parseSteps('{"build": {"outputs": []}}')).toThrow(
        'Steps context: step "build" field "outputs" must be an object',
      );
    });
  });

  describe("real-world-like inputs", () => {
    it("parses a typical terraform workflow steps context", () => {
      const json = JSON.stringify({
        init: {
          outcome: "success",
          conclusion: "success",
          outputs: {
            stdout_file: "/tmp/init.stdout",
            stderr_file: "/tmp/init.stderr",
            exit_code: "0",
          },
        },
        validate: {
          outcome: "success",
          conclusion: "success",
          outputs: {
            stdout_file: "/tmp/validate.stdout",
            stderr_file: "/tmp/validate.stderr",
            exit_code: "0",
          },
        },
        plan: {
          outcome: "success",
          conclusion: "success",
          outputs: {
            stdout_file: "/tmp/plan.stdout",
            stderr_file: "/tmp/plan.stderr",
            exit_code: "2",
          },
        },
        "show-plan": {
          outcome: "success",
          conclusion: "success",
          outputs: {
            stdout_file: "/tmp/show-plan.stdout",
            stderr_file: "/tmp/show-plan.stderr",
            exit_code: "0",
          },
        },
      });

      const result = parseSteps(json);
      expect(Object.keys(result)).toHaveLength(4);
      expect(result["plan"]?.outputs?.["exit_code"]).toBe("2");
      expect(result["show-plan"]?.outcome).toBe("success");
    });

    it("parses continue-on-error step", () => {
      const json = JSON.stringify({
        plan: {
          outcome: "failure",
          conclusion: "success",
          outputs: { exit_code: "1" },
        },
      });
      const result = parseSteps(json);
      expect(result["plan"]?.outcome).toBe("failure");
      expect(result["plan"]?.conclusion).toBe("success");
    });

    it("parses mixed terraform and non-terraform steps", () => {
      const json = JSON.stringify({
        checkout: { outcome: "success", conclusion: "success", outputs: {} },
        init: { outcome: "success", conclusion: "success", outputs: { exit_code: "0" } },
        plan: { outcome: "success", conclusion: "success", outputs: { exit_code: "2" } },
        "show-plan": { outcome: "success", conclusion: "success", outputs: {} },
        "post-comment": { outcome: "success", conclusion: "success", outputs: {} },
      });
      const result = parseSteps(json);
      expect(Object.keys(result)).toHaveLength(5);
    });
  });
});
