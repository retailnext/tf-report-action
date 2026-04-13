import { describe, it, expect } from "vitest";
import {
  escapeMarkerWorkspace,
  buildMarker,
} from "../../../src/comment/marker.js";

describe("escapeMarkerWorkspace", () => {
  it("passes through simple names unchanged", () => {
    expect(escapeMarkerWorkspace("my-workspace")).toBe("my-workspace");
  });

  it("escapes backslashes", () => {
    expect(escapeMarkerWorkspace("a\\b")).toBe("a\\\\b");
  });

  it("escapes double quotes", () => {
    expect(escapeMarkerWorkspace('a"b')).toBe('a\\"b');
  });

  it("escapes HTML comment close sequences", () => {
    expect(escapeMarkerWorkspace("a-->b")).toBe("a--\\>b");
    expect(escapeMarkerWorkspace("a--!>b")).toBe("a--!\\>b");
  });
});

describe("buildMarker", () => {
  it("wraps workspace in HTML comment with tf-report-action prefix", () => {
    expect(buildMarker("prod")).toBe('<!-- tf-report-action:"prod" -->');
  });

  it("escapes special characters in workspace name", () => {
    expect(buildMarker('a"b')).toBe('<!-- tf-report-action:"a\\"b" -->');
  });
});
