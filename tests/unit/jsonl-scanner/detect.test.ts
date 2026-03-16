import { describe, it, expect } from "vitest";
import { isJsonLines } from "../../../src/jsonl-scanner/detect.js";

describe("isJsonLines", () => {
  it("returns true for lines with a type field", () => {
    const lines = [
      '{"type":"version","terraform":"1.5.0","ui":"1.0"}',
      '{"type":"planned_change","change":{}}',
    ];
    expect(isJsonLines(lines)).toBe(true);
  });

  it("returns true if only one line has a type field", () => {
    const lines = ["This is plaintext", '{"type":"version","ui":"1.0"}'];
    expect(isJsonLines(lines)).toBe(true);
  });

  it("returns false for empty input", () => {
    expect(isJsonLines([])).toBe(false);
  });

  it("returns false for only blank lines", () => {
    expect(isJsonLines(["", "   ", "\t"])).toBe(false);
  });

  it("returns false for plaintext lines", () => {
    const lines = [
      "Terraform used the selected providers to generate the following",
      "execution plan. Resource actions are indicated with the following",
    ];
    expect(isJsonLines(lines)).toBe(false);
  });

  it("returns false for JSON without a type field", () => {
    const lines = ['{"name":"test","value":42}'];
    expect(isJsonLines(lines)).toBe(false);
  });

  it("returns false for JSON arrays", () => {
    const lines = ['[{"type":"version"}]'];
    expect(isJsonLines(lines)).toBe(false);
  });

  it("skips invalid JSON and finds valid JSONL later", () => {
    const lines = ["garbage {{{", '{"type":"log","@message":"hello"}'];
    expect(isJsonLines(lines)).toBe(true);
  });

  it("returns false when type is not a string", () => {
    const lines = ['{"type":42}'];
    expect(isJsonLines(lines)).toBe(false);
  });
});
