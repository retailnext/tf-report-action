import { describe, expect, it } from "vitest";
import type { ReportElement } from "../../../src/renderable/types.js";
import { SummaryElement } from "../../../src/elements/summary.js";
import type {
  Summary,
  SummaryActionGroup,
} from "../../../src/model/summary.js";

function assertElementSizeInvariant(el: ReportElement, label?: string): void {
  for (const fmt of ["markdown", "html"] as const) {
    for (let lvl = 0; lvl < el.levels; lvl++) {
      const rendered = el.render(fmt, lvl);
      expect(
        el.size(fmt, lvl),
        `${label ?? el.id} size(${fmt}, ${String(lvl)})`,
      ).toBe(rendered.length);
    }
  }
}

describe("SummaryElement", () => {
  it("has correct metadata", () => {
    const el = new SummaryElement("Plan", undefined, false);
    expect(el.id).toBe("summary");
    expect(el.fixed).toBe(true);
    expect(el.levels).toBe(1);
  });

  it("renders just heading when summary is undefined", () => {
    const el = new SummaryElement("Plan", undefined, false);
    const md = el.render("markdown", 0);
    expect(md).toBe("## Plan\n\n");

    const html = el.render("html", 0);
    expect(html).toBe("<h2>Plan</h2>\n");
  });

  it("renders 'No changes.' for empty summary", () => {
    const summary: Summary = { actions: [], failures: [] };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("## Plan");
    expect(md).toContain("_No changes._");
  });

  it("renders 'No changes.' in HTML for empty summary", () => {
    const summary: Summary = { actions: [], failures: [] };
    const el = new SummaryElement("Plan", summary, false);
    const html = el.render("html", 0);
    expect(html).toContain("<h2>Plan</h2>");
    expect(html).toContain("No changes.");
  });

  it("renders action table with present-tense labels for plan", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 2 }],
          total: 2,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("Add");
    expect(md).toContain("aws\\_instance");
    expect(md).toContain("2");
  });

  it("renders action table with past-tense labels for apply", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 1 }],
          total: 1,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Apply", summary, true);
    const md = el.render("markdown", 0);
    expect(md).toContain("Added");
    expect(md).toContain("aws\\_instance");
  });

  it("renders multiple action groups", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 1 }],
          total: 1,
        },
        {
          action: "delete",
          resourceTypes: [{ type: "aws_s3_bucket", count: 3 }],
          total: 3,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("Add");
    expect(md).toContain("Destroy");
    expect(md).toContain("aws\\_instance");
    expect(md).toContain("aws\\_s3\\_bucket");
  });

  it("renders failure labels for apply failures", () => {
    const summary: Summary = {
      actions: [],
      failures: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 1 }],
          total: 1,
        },
      ],
    };
    const el = new SummaryElement("Apply", summary, true);
    const md = el.render("markdown", 0);
    expect(md).toContain("Add failed");
    expect(md).toContain("❌");
  });

  it("renders table headers in markdown", () => {
    const summary: Summary = {
      actions: [
        {
          action: "update",
          resourceTypes: [{ type: "aws_security_group", count: 1 }],
          total: 1,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("| Action | Resource | Count |");
  });

  it("renders table in HTML with proper structure", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 2 }],
          total: 2,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Plan", summary, false);
    const html = el.render("html", 0);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("</table>");
  });

  it("renders bold subtotal row", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 2 }],
          total: 2,
        },
      ],
      failures: [],
    };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("**Add**");
    expect(md).toContain("**2**");

    const html = el.render("html", 0);
    expect(html).toContain("<strong>Add</strong>");
    expect(html).toContain("<strong>2</strong>");
  });

  it("uses plan labels (present tense)", () => {
    const actions: SummaryActionGroup[] = [
      {
        action: "update",
        resourceTypes: [{ type: "aws_vpc", count: 1 }],
        total: 1,
      },
      {
        action: "replace",
        resourceTypes: [{ type: "aws_instance", count: 1 }],
        total: 1,
      },
      {
        action: "move",
        resourceTypes: [{ type: "aws_s3_bucket", count: 1 }],
        total: 1,
      },
    ];
    const summary: Summary = { actions, failures: [] };
    const el = new SummaryElement("Plan", summary, false);
    const md = el.render("markdown", 0);
    expect(md).toContain("Change");
    expect(md).toContain("Replace");
    expect(md).toContain("Move");
  });

  it("uses apply labels (past tense)", () => {
    const actions: SummaryActionGroup[] = [
      {
        action: "update",
        resourceTypes: [{ type: "aws_vpc", count: 1 }],
        total: 1,
      },
      {
        action: "delete",
        resourceTypes: [{ type: "aws_s3_bucket", count: 1 }],
        total: 1,
      },
    ];
    const summary: Summary = { actions, failures: [] };
    const el = new SummaryElement("Apply", summary, true);
    const md = el.render("markdown", 0);
    expect(md).toContain("Changed");
    expect(md).toContain("Destroyed");
  });

  it("uses failure labels for apply failures", () => {
    const summary: Summary = {
      actions: [],
      failures: [
        {
          action: "update",
          resourceTypes: [{ type: "aws_rds_instance", count: 1 }],
          total: 1,
        },
        {
          action: "delete",
          resourceTypes: [{ type: "aws_s3_bucket", count: 1 }],
          total: 1,
        },
      ],
    };
    const el = new SummaryElement("Apply", summary, true);
    const md = el.render("markdown", 0);
    expect(md).toContain("Change failed");
    expect(md).toContain("Destroy failed");
  });

  it("satisfies the size invariant for undefined summary", () => {
    assertElementSizeInvariant(
      new SummaryElement("Plan", undefined, false),
      "undefined-summary",
    );
  });

  it("satisfies the size invariant for empty summary", () => {
    const summary: Summary = { actions: [], failures: [] };
    assertElementSizeInvariant(
      new SummaryElement("Plan", summary, false),
      "empty-summary",
    );
  });

  it("satisfies the size invariant for plan summary with actions", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [
            { type: "aws_instance", count: 2 },
            { type: "aws_security_group", count: 1 },
          ],
          total: 3,
        },
        {
          action: "replace",
          resourceTypes: [{ type: "aws_vpc", count: 1 }],
          total: 1,
        },
      ],
      failures: [],
    };
    assertElementSizeInvariant(
      new SummaryElement("Plan", summary, false),
      "plan-actions",
    );
  });

  it("satisfies the size invariant for apply summary with failures", () => {
    const summary: Summary = {
      actions: [
        {
          action: "create",
          resourceTypes: [{ type: "aws_instance", count: 1 }],
          total: 1,
        },
      ],
      failures: [
        {
          action: "delete",
          resourceTypes: [{ type: "aws_s3_bucket", count: 2 }],
          total: 2,
        },
      ],
    };
    assertElementSizeInvariant(
      new SummaryElement("Apply", summary, true),
      "apply-failures",
    );
  });
});
