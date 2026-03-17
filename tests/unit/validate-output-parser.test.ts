import { describe, it, expect } from "vitest";
import { parseValidateOutput } from "../../src/parser/validate-output.js";

describe("parseValidateOutput", () => {
  it("parses a valid output with no diagnostics", () => {
    const input = JSON.stringify({
      format_version: "1.0",
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    const result = parseValidateOutput(input);
    expect(result.format_version).toBe("1.0");
    expect(result.valid).toBe(true);
    expect(result.error_count).toBe(0);
    expect(result.warning_count).toBe(0);
    expect(result.diagnostics).toEqual([]);
  });

  it("parses output with diagnostics", () => {
    const input = JSON.stringify({
      format_version: "1.0",
      valid: false,
      error_count: 1,
      warning_count: 1,
      diagnostics: [
        {
          severity: "error",
          summary: "Missing required provider",
          detail: "detailed error",
        },
        {
          severity: "warning",
          summary: "Deprecated attribute",
          detail: "use something else",
        },
      ],
    });
    const result = parseValidateOutput(input);
    expect(result.valid).toBe(false);
    expect(result.error_count).toBe(1);
    expect(result.warning_count).toBe(1);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[1]?.severity).toBe("warning");
  });

  // Error handling

  it("throws on invalid JSON without exposing input content", () => {
    const sensitiveInput = '{"password": "s3cr3t"}bad';
    expect(() => parseValidateOutput(sensitiveInput)).toThrow(/not valid JSON/);
    try {
      parseValidateOutput(sensitiveInput);
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      expect(msg).not.toContain("s3cr3t");
    }
  });

  it("throws when input is a JSON array", () => {
    expect(() => parseValidateOutput("[]")).toThrow(/JSON object/);
  });

  it("throws when input is a JSON string", () => {
    expect(() => parseValidateOutput('"hello"')).toThrow(/JSON object/);
  });

  it("throws when input is null JSON", () => {
    expect(() => parseValidateOutput("null")).toThrow(/JSON object/);
  });

  it("throws when format_version is missing", () => {
    const input = JSON.stringify({
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    expect(() => parseValidateOutput(input)).toThrow(/format_version/);
  });

  it("throws when format_version is not a string", () => {
    const input = JSON.stringify({
      format_version: 1,
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    expect(() => parseValidateOutput(input)).toThrow(/format_version/);
  });

  it("throws when format_version major is greater than 1", () => {
    const input = JSON.stringify({
      format_version: "2.0",
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    expect(() => parseValidateOutput(input)).toThrow(/major version 2/);
  });

  it("accepts format_version 1.x variants", () => {
    for (const v of ["1.0", "1.1", "1.99"]) {
      const input = JSON.stringify({
        format_version: v,
        valid: true,
        error_count: 0,
        warning_count: 0,
        diagnostics: [],
      });
      expect(parseValidateOutput(input).format_version).toBe(v);
    }
  });

  it("accepts format_version 0.x variants", () => {
    const input = JSON.stringify({
      format_version: "0.1",
      valid: true,
      error_count: 0,
      warning_count: 0,
      diagnostics: [],
    });
    expect(parseValidateOutput(input).format_version).toBe("0.1");
  });
});
