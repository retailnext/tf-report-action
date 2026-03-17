import { describe, it, expect } from "vitest";
import { parseState } from "../../../src/parser/state.js";

describe("parseState", () => {
  it("parses valid state JSON", () => {
    const state = parseState(
      JSON.stringify({
        format_version: "1.0",
        terraform_version: "1.9.0",
        values: {
          root_module: {
            resources: [],
          },
        },
      }),
    );
    expect(state.format_version).toBe("1.0");
    expect(state.values?.root_module).toBeDefined();
  });

  it("parses empty state (no values)", () => {
    const state = parseState(
      JSON.stringify({ format_version: "1.0", terraform_version: "1.9.0" }),
    );
    expect(state.format_version).toBe("1.0");
    expect(state.values).toBeUndefined();
  });

  it("accepts format_version 0.x", () => {
    const state = parseState(
      JSON.stringify({ format_version: "0.1" }),
    );
    expect(state.format_version).toBe("0.1");
  });

  it("throws on format_version > 1", () => {
    expect(() =>
      parseState(JSON.stringify({ format_version: "2.0" })),
    ).toThrow("Unsupported state format_version");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseState("not json")).toThrow(
      "input is not valid JSON",
    );
  });

  it("throws on non-object input", () => {
    expect(() => parseState('"just a string"')).toThrow(
      "must be a JSON object",
    );
  });

  it("throws on missing format_version", () => {
    expect(() => parseState(JSON.stringify({ values: {} }))).toThrow(
      "missing required field: format_version",
    );
  });

  it("throws on array input", () => {
    expect(() => parseState("[]")).toThrow("must be a JSON object");
  });
});
