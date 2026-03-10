import { describe, it, expect } from "vitest";
import { resolveTemplate } from "../../src/template/index.js";

describe("resolveTemplate", () => {
  it("resolves 'default' template", () => {
    const t = resolveTemplate("default");
    expect(t.name).toBe("default");
  });

  it("resolves 'summary' template", () => {
    const t = resolveTemplate("summary");
    expect(t.name).toBe("summary");
  });

  it("throws for unknown template name", () => {
    expect(() => resolveTemplate("nonexistent")).toThrowError(/Unknown template/);
  });

  it("error message includes the invalid name", () => {
    expect(() => resolveTemplate("bad-template")).toThrowError("bad-template");
  });

  it("error message lists valid templates", () => {
    try {
      resolveTemplate("invalid");
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      expect(msg).toContain("default");
      expect(msg).toContain("summary");
    }
  });

  it("throws for empty string", () => {
    expect(() => resolveTemplate("")).toThrowError(/Unknown template/);
  });
});
