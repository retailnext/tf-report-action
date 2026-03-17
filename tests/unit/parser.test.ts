import { describe, it, expect } from "vitest";
import { parsePlan } from "../../src/parser/index.js";

describe("parsePlan", () => {
  const minimalValidPlan = JSON.stringify({
    format_version: "1.2",
    resource_changes: [],
  });

  it("parses a minimal valid plan", () => {
    const plan = parsePlan(minimalValidPlan);
    expect(plan.format_version).toBe("1.2");
    expect(plan.resource_changes).toEqual([]);
  });

  it("accepts format_version 1.0", () => {
    const plan = parsePlan(
      JSON.stringify({ format_version: "1.0", resource_changes: [] }),
    );
    expect(plan.format_version).toBe("1.0");
  });

  it("accepts format_version 1.99 (any 1.x)", () => {
    const plan = parsePlan(
      JSON.stringify({ format_version: "1.99", resource_changes: [] }),
    );
    expect(plan.format_version).toBe("1.99");
  });

  it("throws on invalid JSON without exposing the input content", () => {
    expect(() => parsePlan('{"password": bad_json}')).toThrow(
      /Failed to parse plan JSON/,
    );
  });

  it("error message does not contain input content when JSON is invalid", () => {
    const sensitiveInput = '{"password": "s3cr3t_token_12345"}';
    try {
      parsePlan(sensitiveInput + "garbage");
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      expect(msg).not.toContain("s3cr3t_token_12345");
      expect(msg).not.toContain("garbage");
    }
  });

  it("throws when input is a JSON array (not an object)", () => {
    expect(() => parsePlan("[]")).toThrow(/JSON object/);
  });

  it("throws when input is a JSON string", () => {
    expect(() => parsePlan('"hello"')).toThrow(/JSON object/);
  });

  it("throws when input is null JSON", () => {
    expect(() => parsePlan("null")).toThrow(/JSON object/);
  });

  it("throws when format_version is missing", () => {
    expect(() => parsePlan(JSON.stringify({ resource_changes: [] }))).toThrow(
      /format_version/,
    );
  });

  it("throws when format_version is not a string", () => {
    expect(() =>
      parsePlan(JSON.stringify({ format_version: 1, resource_changes: [] })),
    ).toThrow(/format_version/);
  });

  it("throws when format_version major is 2", () => {
    expect(() =>
      parsePlan(
        JSON.stringify({ format_version: "2.0", resource_changes: [] }),
      ),
    ).toThrow(/format_version/);
  });

  it("throws when format_version major is NaN", () => {
    expect(() =>
      parsePlan(
        JSON.stringify({ format_version: "invalid", resource_changes: [] }),
      ),
    ).toThrow(/format_version/);
  });

  it("succeeds when resource_changes is absent (empty workspace)", () => {
    // resource_changes is optional per the plan JSON schema — absent when no resources exist
    const plan = parsePlan(JSON.stringify({ format_version: "1.0" }));
    expect(plan.resource_changes).toBeUndefined();
  });

  it("returns the terraform_version when present", () => {
    const plan = parsePlan(
      JSON.stringify({
        format_version: "1.2",
        terraform_version: "1.9.0",
        resource_changes: [],
      }),
    );
    expect(plan.terraform_version).toBe("1.9.0");
  });
});
