import { describe, it, expect } from "vitest";
import { buildTruncationNotice } from "../../../src/compositor/truncation.js";

describe("buildTruncationNotice", () => {
  it("includes a clickable link when link is provided", () => {
    const url = "https://github.com/owner/repo/actions/runs/12345";
    const result = buildTruncationNotice({
      url,
      label: "View full workflow run logs",
    });
    expect(result).toContain("Output truncated");
    expect(result).toContain("⚠️");
    expect(result).toContain(`[View full workflow run logs](${url})`);
  });

  it("uses a generic message when link is undefined", () => {
    const result = buildTruncationNotice(undefined);
    expect(result).toContain("Output truncated");
    expect(result).toContain("⚠️");
    expect(result).toContain("Check the workflow run logs");
    expect(result).not.toContain("[View full workflow run logs]");
  });

  it("uses a generic message when called with no arguments", () => {
    const result = buildTruncationNotice();
    expect(result).toContain("Check the workflow run logs");
  });

  it("renders a custom label", () => {
    const result = buildTruncationNotice({
      url: "https://example.com/artifact/42",
      label: "View full report",
    });
    expect(result).toContain(
      "[View full report](https://example.com/artifact/42)",
    );
    expect(result).toContain("Output truncated");
  });

  it("starts with a horizontal rule separator", () => {
    const withLink = buildTruncationNotice({
      url: "https://example.com",
      label: "Logs",
    });
    const withoutLink = buildTruncationNotice(undefined);
    expect(withLink).toMatch(/^\n---\n/);
    expect(withoutLink).toMatch(/^\n---\n/);
  });

  it("renders as a blockquote", () => {
    const result = buildTruncationNotice({
      url: "https://example.com",
      label: "Logs",
    });
    expect(result).toContain("> ⚠️");
  });
});
