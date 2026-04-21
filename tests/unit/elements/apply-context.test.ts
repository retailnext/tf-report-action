import { describe, expect, it } from "vitest";
import type { Report } from "../../../src/model/report.js";
import type { Diagnostic } from "../../../src/model/diagnostic.js";
import {
  isApplyReport,
  buildFailedSet,
  buildDiagnosticMap,
  extractNonResourceDiagnostics,
  buildApplyContext,
  buildApplyContextFn,
} from "../../../src/elements/apply-context.js";

/** Create a minimal Report for testing. */
function makeReport(overrides?: Partial<Report>): Report {
  return {
    title: "Test",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...overrides,
  };
}

/** Create a minimal Diagnostic. */
function makeDiag(overrides?: Partial<Diagnostic>): Diagnostic {
  return {
    severity: "error",
    summary: "Something broke",
    detail: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isApplyReport
// ---------------------------------------------------------------------------

describe("isApplyReport", () => {
  it("returns true for apply operation", () => {
    expect(isApplyReport(makeReport({ operation: "apply" }))).toBe(true);
  });

  it("returns true for destroy operation", () => {
    expect(isApplyReport(makeReport({ operation: "destroy" }))).toBe(true);
  });

  it("returns false for plan operation", () => {
    expect(isApplyReport(makeReport({ operation: "plan" }))).toBe(false);
  });

  it("returns false for no operation", () => {
    expect(isApplyReport(makeReport())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildFailedSet
// ---------------------------------------------------------------------------

describe("buildFailedSet", () => {
  it("returns empty set when no apply statuses", () => {
    const set = buildFailedSet(makeReport());
    expect(set.size).toBe(0);
  });

  it("includes failed resource addresses", () => {
    const set = buildFailedSet(
      makeReport({
        applyStatuses: [
          { address: "aws_instance.a", success: false },
          { address: "aws_instance.b", success: true },
        ],
      }),
    );
    expect(set.has("aws_instance.a")).toBe(true);
    expect(set.has("aws_instance.b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDiagnosticMap
// ---------------------------------------------------------------------------

describe("buildDiagnosticMap", () => {
  it("returns empty map when no diagnostics", () => {
    const map = buildDiagnosticMap(makeReport());
    expect(map.size).toBe(0);
  });

  it("groups diagnostics by address", () => {
    const map = buildDiagnosticMap(
      makeReport({
        diagnostics: [
          makeDiag({ address: "aws_instance.a", summary: "err1" }),
          makeDiag({ address: "aws_instance.a", summary: "err2" }),
          makeDiag({ address: "aws_instance.b", summary: "err3" }),
        ],
      }),
    );
    expect(map.get("aws_instance.a")).toHaveLength(2);
    expect(map.get("aws_instance.b")).toHaveLength(1);
  });

  it("excludes diagnostics without address", () => {
    const map = buildDiagnosticMap(
      makeReport({
        diagnostics: [makeDiag({ summary: "no address" })],
      }),
    );
    expect(map.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractNonResourceDiagnostics
// ---------------------------------------------------------------------------

describe("extractNonResourceDiagnostics", () => {
  it("returns empty array when no diagnostics", () => {
    const result = extractNonResourceDiagnostics(makeReport());
    expect(result).toEqual([]);
  });

  it("returns diagnostics without address", () => {
    const diag = makeDiag({ summary: "general error" });
    const result = extractNonResourceDiagnostics(
      makeReport({ diagnostics: [diag] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.summary).toBe("general error");
  });

  it("returns diagnostics whose address doesn't match any resource", () => {
    const diag = makeDiag({
      address: "aws_instance.orphan",
      summary: "orphan diag",
    });
    const result = extractNonResourceDiagnostics(
      makeReport({
        diagnostics: [diag],
        resources: [
          {
            address: "aws_instance.web",
            type: "aws_instance",
            action: "create",
            actionReason: null,
            attributes: [],
            hasAttributeDetail: false,
            importId: null,
            movedFromAddress: null,
            allUnknownAfterApply: false,
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("excludes diagnostics whose address matches a resource", () => {
    const result = extractNonResourceDiagnostics(
      makeReport({
        diagnostics: [makeDiag({ address: "aws_instance.web" })],
        resources: [
          {
            address: "aws_instance.web",
            type: "aws_instance",
            action: "create",
            actionReason: null,
            attributes: [],
            hasAttributeDetail: false,
            importId: null,
            movedFromAddress: null,
            allUnknownAfterApply: false,
          },
        ],
      }),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildApplyContext
// ---------------------------------------------------------------------------

describe("buildApplyContext", () => {
  it("marks resource as failed when in failed set", () => {
    const ctx = buildApplyContext(
      "aws_instance.web",
      new Set(["aws_instance.web"]),
      new Map(),
    );
    expect(ctx.failed).toBe(true);
    expect(ctx.diagnostics).toEqual([]);
  });

  it("includes diagnostics for the address", () => {
    const diag = makeDiag({ address: "aws_instance.web" });
    const map = new Map([["aws_instance.web", [diag]]]);
    const ctx = buildApplyContext("aws_instance.web", new Set(), map);
    expect(ctx.failed).toBe(false);
    expect(ctx.diagnostics).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildApplyContextFn
// ---------------------------------------------------------------------------

describe("buildApplyContextFn", () => {
  it("returns undefined for non-apply reports", () => {
    const fn = buildApplyContextFn(makeReport({ operation: "plan" }));
    expect(fn).toBeUndefined();
  });

  it("returns a function for apply reports", () => {
    const fn = buildApplyContextFn(makeReport({ operation: "apply" }));
    expect(typeof fn).toBe("function");
  });

  it("returned function provides correct context", () => {
    const fn = buildApplyContextFn(
      makeReport({
        operation: "apply",
        applyStatuses: [{ address: "aws_instance.web", success: false }],
        diagnostics: [
          makeDiag({ address: "aws_instance.web", summary: "failed" }),
        ],
      }),
    );
    expect(fn).toBeDefined();
    const ctx = fn!("aws_instance.web");
    expect(ctx.failed).toBe(true);
    expect(ctx.diagnostics).toHaveLength(1);
  });
});
