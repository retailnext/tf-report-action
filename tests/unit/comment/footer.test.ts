import { describe, it, expect } from "vitest";
import {
  formatTimestamp,
  buildLogsUrl,
  parseRepo,
  buildFooter,
  calculateBudget,
  COMMENT_LIMIT,
  OVERHEAD_RESERVE,
} from "../../../src/comment/footer.js";
import type { Env } from "../../../src/env/index.js";

describe("formatTimestamp", () => {
  it("formats a UTC date", () => {
    const date = new Date("2025-03-15T14:30:00Z");
    expect(formatTimestamp(date)).toBe("March 15, 2025 at 14:30 UTC");
  });

  it("zero-pads hours and minutes", () => {
    const date = new Date("2025-01-01T03:05:00Z");
    expect(formatTimestamp(date)).toBe("January 1, 2025 at 03:05 UTC");
  });
});

describe("buildLogsUrl", () => {
  it("constructs a GitHub Actions run URL", () => {
    const env: Env = {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: "12345",
      GITHUB_RUN_ATTEMPT: "2",
    };
    expect(buildLogsUrl(env)).toBe(
      "https://github.com/owner/repo/actions/runs/12345/attempts/2",
    );
  });

  it("defaults attempt to 1", () => {
    const env: Env = {
      GITHUB_REPOSITORY: "o/r",
      GITHUB_RUN_ID: "1",
    };
    expect(buildLogsUrl(env)).toBe(
      "https://github.com/o/r/actions/runs/1/attempts/1",
    );
  });
});

describe("parseRepo", () => {
  it("parses owner/repo", () => {
    const env: Env = { GITHUB_REPOSITORY: "acme/widgets" };
    expect(parseRepo(env)).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("returns undefined for missing env var", () => {
    expect(parseRepo({})).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseRepo({ GITHUB_REPOSITORY: "" })).toBeUndefined();
  });

  it("returns undefined for no slash", () => {
    expect(parseRepo({ GITHUB_REPOSITORY: "noslash" })).toBeUndefined();
  });

  it("returns undefined for leading slash", () => {
    expect(parseRepo({ GITHUB_REPOSITORY: "/repo" })).toBeUndefined();
  });

  it("returns undefined for trailing slash", () => {
    expect(parseRepo({ GITHUB_REPOSITORY: "owner/" })).toBeUndefined();
  });
});

describe("buildFooter", () => {
  it("builds PR footer with logs link only", () => {
    const footer = buildFooter("https://example.com/logs", true);
    expect(footer).toBe("\n---\n\n[View logs](https://example.com/logs)\n");
  });

  it("builds issue footer with logs link and timestamp", () => {
    const now = new Date("2025-06-01T12:00:00Z");
    const footer = buildFooter("https://example.com/logs", false, now);
    expect(footer).toContain("[View logs](https://example.com/logs)");
    expect(footer).toContain("Last updated: June 1, 2025 at 12:00 UTC");
  });
});

describe("calculateBudget", () => {
  it("subtracts footer and overhead from comment limit", () => {
    const budget = calculateBudget(100);
    expect(budget).toBe(COMMENT_LIMIT - 100 - OVERHEAD_RESERVE);
  });

  it("returns 0 when footer exceeds budget", () => {
    const budget = calculateBudget(COMMENT_LIMIT);
    expect(budget).toBe(0);
  });
});
