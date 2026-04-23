import { describe, expect, it } from "vitest";
import { buildReportElements } from "../../../src/elements/report-elements.js";
import type { Report } from "../../../src/model/report.js";
import type { ResourceChange } from "../../../src/model/resource.js";

/** Minimal resource change with all required fields. */
function makeResource(overrides?: Partial<ResourceChange>): ResourceChange {
  return {
    address: "null_resource.test",
    type: "null_resource",
    action: "create",
    actionReason: null,
    attributes: [],
    hasAttributeDetail: false,
    importId: null,
    movedFromAddress: null,
    allUnknownAfterApply: false,
    ...overrides,
  };
}

/** Minimal empty report with required fields. */
function emptyReport(overrides?: Partial<Report>): Report {
  return {
    title: { status: "success", body: { kind: "no-changes" } },
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    ...overrides,
  };
}

describe("buildReportElements", () => {
  it("returns title for an empty report", () => {
    const elements = buildReportElements(emptyReport());
    expect(elements.length).toBe(1);
    expect(elements[0]!.id).toBe("title");
  });

  it("includes marker when workspace is set", () => {
    const elements = buildReportElements(emptyReport({ workspace: "staging" }));
    expect(elements[0]!.id).toBe("marker");
    expect(elements[1]!.id).toBe("title");
  });

  it("includes warnings in order", () => {
    const elements = buildReportElements(
      emptyReport({ warnings: ["warning A", "warning B"] }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toEqual(["title", "warning-0", "warning-1"]);
  });

  it("includes step issues", () => {
    const elements = buildReportElements(
      emptyReport({
        issues: [
          {
            id: "init",
            reason: "failed",
            isFailed: true,
            stderr: "error output",
          },
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("issue-init");
  });

  it("builds error body when error is set", () => {
    const elements = buildReportElements(
      emptyReport({
        error: "Something went wrong",
        steps: [{ id: "init", outcome: "success" }],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("message");
    expect(ids).toContain("step-statuses");
  });

  it("builds workflow body for steps-only report", () => {
    const elements = buildReportElements(
      emptyReport({
        steps: [
          { id: "init", outcome: "success" },
          { id: "plan", outcome: "failure" },
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("step-table");
  });

  it("builds text fallback for raw stdout without structured data", () => {
    const elements = buildReportElements(
      emptyReport({
        rawStdout: [
          { stepId: "plan", label: "Plan Output", content: "some output" },
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("raw-plan");
  });

  it("builds structured body with summary and resources", () => {
    const elements = buildReportElements(
      emptyReport({
        summary: { actions: [], failures: [] },
        resources: [makeResource()],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("summary");
    expect(ids).toContain("resources");
  });

  it("includes outputs category when outputs present", () => {
    const elements = buildReportElements(
      emptyReport({
        summary: { actions: [], failures: [] },
        outputs: [
          {
            name: "ip",
            action: "create",
            before: null,
            after: "10.0.0.1",
            isSensitive: false,
            isLarge: false,
            isKnownAfterApply: false,
          },
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("outputs");
  });

  it("includes drift category when drift resources present", () => {
    const elements = buildReportElements(
      emptyReport({
        summary: { actions: [], failures: [] },
        driftResources: [
          makeResource({
            address: "null_resource.drifted",
            action: "update",
          }),
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("drift");
  });

  it("includes raw stdout collapsible in structured body", () => {
    const elements = buildReportElements(
      emptyReport({
        summary: { actions: [], failures: [] },
        rawStdout: [
          {
            stepId: "plan",
            label: "Plan Output",
            content: "raw plan output text",
          },
        ],
      }),
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("raw-plan");
  });

  it("user title is included when title option is set", () => {
    const elements = buildReportElements(
      emptyReport({
        summary: { actions: [], failures: [] },
      }),
      { title: "PR #42" },
    );
    const ids = elements.map((e) => e.id);
    expect(ids).toContain("user-title");
  });

  it("all elements are valid renderables", () => {
    const elements = buildReportElements(
      emptyReport({
        workspace: "prod",
        warnings: ["watch out"],
        summary: { actions: [], failures: [] },
        resources: [makeResource({ address: "null_resource.a" })],
        issues: [
          {
            id: "validate",
            reason: "outcome",
            outcome: "success",
            isFailed: false,
            stderr: "deprecation notice",
          },
        ],
      }),
    );

    for (const el of elements) {
      for (let level = 0; level < el.levels; level++) {
        const mdSize = el.size("markdown", level);
        const htmlSize = el.size("html", level);
        expect(mdSize).toBeGreaterThanOrEqual(0);
        expect(htmlSize).toBeGreaterThanOrEqual(0);

        const md = el.render("markdown", level);
        const html = el.render("html", level);
        expect(md.length).toBe(mdSize);
        expect(html.length).toBe(htmlSize);
      }
    }
  });
});
