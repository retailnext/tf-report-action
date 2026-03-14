import { describe, it, expect } from "vitest";
import { buildTruncationNotice } from "../../../src/compositor/truncation.js";

describe("buildTruncationNotice", () => {
  it("includes the logs URL when provided", () => {
    const url = "https://github.com/owner/repo/actions/runs/12345";
    const result = buildTruncationNotice(url);
    expect(result).toContain("Output truncated");
    expect(result).toContain("⚠️");
    expect(result).toContain(`[View full workflow run logs](${url})`);
  });

  it("uses a generic message when logsUrl is undefined", () => {
    const result = buildTruncationNotice(undefined);
    expect(result).toContain("Output truncated");
    expect(result).toContain("⚠️");
    expect(result).toContain("Check the workflow run logs");
    expect(result).not.toContain("[View full workflow run logs]");
  });

  it("starts with a horizontal rule separator", () => {
    const withUrl = buildTruncationNotice("https://example.com");
    const withoutUrl = buildTruncationNotice(undefined);
    expect(withUrl).toMatch(/^\n---\n/);
    expect(withoutUrl).toMatch(/^\n---\n/);
  });

  it("renders as a blockquote", () => {
    const result = buildTruncationNotice("https://example.com");
    expect(result).toContain("> ⚠️");
  });
});
