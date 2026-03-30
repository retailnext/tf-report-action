import { describe, it, expect } from "vitest";
import {
  buildTruncationNotice,
  buildLogsNotice,
  buildArtifactNotice,
} from "../../../src/compositor/truncation.js";

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

describe("buildLogsNotice", () => {
  const link = {
    url: "https://github.com/owner/repo/actions/runs/12345/attempts/1",
    label: "workflow run logs",
  };

  it("renders a blockquote with info icon and link", () => {
    const result = buildLogsNotice(link);
    expect(result).toContain("> ℹ️");
    expect(result).toContain(`[workflow run logs](${link.url})`);
  });

  it("mentions step errors not shown", () => {
    const result = buildLogsNotice(link);
    expect(result).toContain("step errors are not shown");
  });

  it("starts with a horizontal rule separator", () => {
    const result = buildLogsNotice(link);
    expect(result).toMatch(/^\n---\n/);
  });

  it("includes the custom label in the link", () => {
    const result = buildLogsNotice({
      url: "https://example.com/logs",
      label: "View logs",
    });
    expect(result).toContain("[View logs](https://example.com/logs)");
  });
});

describe("buildArtifactNotice", () => {
  const link = {
    url: "https://github.com/owner/repo/actions/runs/123/artifacts/42",
    label: "View/Download Report",
  };

  it("renders a compact link with paperclip emoji", () => {
    const result = buildArtifactNotice(link);
    expect(result).toContain("📎");
    expect(result).toContain(`[View/Download Report](${link.url})`);
  });

  it("does not render as a blockquote", () => {
    const result = buildArtifactNotice(link);
    expect(result).not.toContain("> ");
  });

  it("does not include a horizontal rule", () => {
    const result = buildArtifactNotice(link);
    expect(result).not.toContain("---");
  });
});
