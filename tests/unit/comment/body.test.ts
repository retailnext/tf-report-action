import { describe, it, expect } from "vitest";
import {
  buildTruncation,
  assembleCommentBody,
} from "../../../src/comment/body.js";

describe("buildTruncation", () => {
  it("returns truncation notice with artifact URL when provided", () => {
    const notice = buildTruncation("https://artifact.url", "https://logs.url");
    expect(notice).toContain("https://artifact.url");
    expect(notice).toContain("View full report");
  });

  it("falls back to logs URL when no artifact URL", () => {
    const notice = buildTruncation(undefined, "https://logs.url");
    expect(notice).toContain("https://logs.url");
    expect(notice).toContain("View full workflow run logs");
  });
});

describe("assembleCommentBody", () => {
  it("appends footer to markdown with no options", () => {
    const body = assembleCommentBody("# Report\n", "\n---\nfooter\n");
    expect(body).toBe("# Report\n\n---\nfooter\n");
  });

  it("inserts artifact notice when not truncated but artifact uploaded", () => {
    const body = assembleCommentBody("# Report\n", "\nfooter\n", {
      artifactUrl: "https://artifact.url",
    });
    expect(body).toContain("https://artifact.url");
    expect(body).toContain("View/Download Report");
    expect(body).toContain("footer");
  });

  it("does not add artifact notice when truncationNotice is set", () => {
    const body = assembleCommentBody("# Report\n", "\nfooter\n", {
      truncationNotice: "\n---\ntruncated\n",
      artifactUrl: "https://artifact.url",
    });
    expect(body).toContain("truncated");
    expect(body).not.toContain("View/Download Report");
  });

  it("appends logs notice when hasUnresolvedFailures is true", () => {
    const body = assembleCommentBody("# Report\n", "\nfooter\n", {
      logsUrl: "https://logs.url",
      hasUnresolvedFailures: true,
    });
    expect(body).toContain("workflow run logs");
  });

  it("does not append logs notice when no failures", () => {
    const body = assembleCommentBody("# Report\n", "\nfooter\n", {
      logsUrl: "https://logs.url",
      hasUnresolvedFailures: false,
    });
    expect(body).not.toContain("workflow run logs");
  });
});
