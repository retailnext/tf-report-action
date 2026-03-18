import { describe, it, expect } from "vitest";
import { renderWorkspaceMarker } from "../../../src/renderer/title.js";
import type { Report } from "../../../src/model/report.js";

/** Construct a minimal Report with only the fields the marker renderer needs. */
function makeReport(workspace?: string): Report {
  return {
    title: "",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...(workspace !== undefined ? { workspace } : {}),
  };
}

/** Extract just the marker string from the section. */
function marker(workspace: string): string {
  const section = renderWorkspaceMarker(makeReport(workspace));
  expect(section).toBeDefined();
  return section!.full;
}

describe("workspace marker compatibility", () => {
  it("returns undefined when no workspace is set", () => {
    expect(renderWorkspaceMarker(makeReport())).toBeUndefined();
  });

  it("simple workspace name", () => {
    expect(marker("production")).toBe(
      '<!-- tf-report-action:"production" -->\n',
    );
  });

  it("slash-separated workspace name", () => {
    expect(marker("staging/us-east-1")).toBe(
      '<!-- tf-report-action:"staging/us-east-1" -->\n',
    );
  });

  it("escapes backslashes", () => {
    expect(marker("foo\\bar")).toBe('<!-- tf-report-action:"foo\\\\bar" -->\n');
  });

  it("escapes double quotes", () => {
    expect(marker('foo"bar')).toBe('<!-- tf-report-action:"foo\\"bar" -->\n');
  });

  it("escapes --> to prevent premature comment closure", () => {
    // Zero-width space breaks the -- sequence
    expect(marker("foo-->bar")).toBe(
      '<!-- tf-report-action:"foo-\u200B->bar" -->\n',
    );
  });

  it("escapes --!> to prevent premature comment closure", () => {
    // Zero-width space breaks the -- sequence, preventing both --> and --!>
    // from terminating the HTML comment.
    expect(marker("foo--!>bar")).toBe(
      '<!-- tf-report-action:"foo-\u200B-!>bar" -->\n',
    );
  });
});
