import { describe, it, expect } from "vitest";
import { parseState } from "../../../src/parser/state.js";

describe("parseState", () => {
  it("parses valid raw state JSON", () => {
    const state = parseState(
      JSON.stringify({
        version: 4,
        terraform_version: "1.9.0",
        serial: 1,
        lineage: "abc",
        resources: [],
        outputs: {},
      }),
    );
    expect(state.version).toBe(4);
    expect(state.resources).toEqual([]);
  });

  it("parses empty state (no resources)", () => {
    const state = parseState(
      JSON.stringify({ version: 4, terraform_version: "1.9.0" }),
    );
    expect(state.version).toBe(4);
    expect(state.resources).toBeUndefined();
  });

  it("accepts version 3", () => {
    const state = parseState(JSON.stringify({ version: 3 }));
    expect(state.version).toBe(3);
  });

  it("throws on version > 4", () => {
    expect(() => parseState(JSON.stringify({ version: 5 }))).toThrow(
      "Unsupported state version",
    );
  });

  it("throws on invalid JSON", () => {
    expect(() => parseState("not json")).toThrow("input is not valid JSON");
  });

  it("throws on non-object input", () => {
    expect(() => parseState('"just a string"')).toThrow(
      "must be a JSON object",
    );
  });

  it("throws on missing version", () => {
    expect(() => parseState(JSON.stringify({ resources: [] }))).toThrow(
      "missing required field: version",
    );
  });

  it("throws on array input", () => {
    expect(() => parseState("[]")).toThrow("must be a JSON object");
  });
});
