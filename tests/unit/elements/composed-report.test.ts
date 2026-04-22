import { describe, expect, it } from "vitest";
import { composeReport } from "../../../src/elements/composed-report.js";
import { buildReportElements } from "../../../src/elements/report-elements.js";
import type {
  OutputFormat,
  ReportElement,
} from "../../../src/renderable/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Fixed element that always renders at one level. */
function fixedEl(id: string, mdText: string, htmlText?: string): ReportElement {
  const html = htmlText ?? mdText;
  return {
    id,
    fixed: true,
    levels: 1,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    size(format: OutputFormat, _level: number): number {
      return format === "markdown" ? mdText.length : html.length;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    render(format: OutputFormat, _level: number): string {
      return format === "markdown" ? mdText : html;
    },
  };
}

/**
 * Flex element with N levels. Level i renders a string of length
 * `baseSize + i * increment` characters.
 */
function flexEl(
  id: string,
  levels: number,
  baseSize: number,
  increment: number,
): ReportElement {
  const texts: string[] = [];
  for (let i = 0; i < levels; i++) {
    const len = baseSize + i * increment;
    texts.push("x".repeat(len));
  }
  return {
    id,
    fixed: false,
    levels,
    size(format: OutputFormat, level: number): number {
      return texts[level]?.length ?? 0;
    },
    render(format: OutputFormat, level: number): string {
      return texts[level] ?? "";
    },
  };
}

/** Flex element where HTML is larger than markdown by a multiplier. */
function flexElDualFormat(
  id: string,
  levels: number,
  mdBase: number,
  mdIncrement: number,
  htmlMultiplier: number,
): ReportElement {
  const mdTexts: string[] = [];
  const htmlTexts: string[] = [];
  for (let i = 0; i < levels; i++) {
    const mdLen = mdBase + i * mdIncrement;
    const htmlLen = Math.round(mdLen * htmlMultiplier);
    mdTexts.push("m".repeat(mdLen));
    htmlTexts.push("h".repeat(htmlLen));
  }
  return {
    id,
    fixed: false,
    levels,
    size(format: OutputFormat, level: number): number {
      const arr = format === "markdown" ? mdTexts : htmlTexts;
      return arr[level]?.length ?? 0;
    },
    render(format: OutputFormat, level: number): string {
      const arr = format === "markdown" ? mdTexts : htmlTexts;
      return arr[level] ?? "";
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ComposedReport", () => {
  describe("fullSize", () => {
    it("returns sum of all elements at max level", () => {
      const report = composeReport([
        fixedEl("title", "# Title\n"),
        flexEl("resources", 5, 100, 50),
      ]);
      // title=8, resources at level 4 = 100 + 4*50 = 300
      expect(report.fullSize("markdown")).toBe(8 + 300);
    });

    it("returns 0 for empty elements", () => {
      const report = composeReport([]);
      expect(report.fullSize("markdown")).toBe(0);
      expect(report.fullSize("html")).toBe(0);
    });

    it("uses html sizes for html format", () => {
      const report = composeReport([
        fixedEl("title", "# Title\n", "<h1>Title</h1>\n"),
      ]);
      expect(report.fullSize("markdown")).toBe(8);
      expect(report.fullSize("html")).toBe(15);
    });
  });

  describe("render without limit", () => {
    it("renders all elements at max level", () => {
      const report = composeReport([
        fixedEl("title", "TITLE"),
        flexEl("resources", 3, 10, 5),
      ]);
      const result = report.render("markdown");
      // title=5 + resources at level 2 = 10+2*5 = 20
      expect(result.output).toBe("TITLE" + "x".repeat(20));
      expect(result.truncated).toBe(false);
    });

    it("returns empty output for no elements", () => {
      const report = composeReport([]);
      const result = report.render("markdown");
      expect(result.output).toBe("");
      expect(result.truncated).toBe(false);
    });

    it("treats Infinity limit as no limit", () => {
      const report = composeReport([flexEl("r", 3, 10, 5)]);
      const noLimit = report.render("markdown");
      const infLimit = report.render("markdown", Infinity);
      expect(infLimit.output).toBe(noLimit.output);
      expect(infLimit.truncated).toBe(false);
    });
  });

  describe("render with limit (no flex)", () => {
    it("renders fixed-only elements at max level regardless of budget", () => {
      const report = composeReport([
        fixedEl("title", "TITLE"),
        fixedEl("summary", "SUMMARY"),
      ]);
      // Budget doesn't degrade fixed elements
      const result = report.render("markdown", 100);
      expect(result.output).toBe("TITLESUMMARY");
      expect(result.truncated).toBe(false);
    });
  });

  describe("progressive enhancement", () => {
    it("uses level 0 when budget is tight", () => {
      const report = composeReport([
        fixedEl("title", "T"),
        flexEl("resources", 5, 100, 50), // level 0=100, 1=150, 2=200, 3=250, 4=300
      ]);
      // Budget = 1 (title) + 100 (resources at level 0)
      const result = report.render("markdown", 101);
      expect(result.output.length).toBe(101);
      expect(result.truncated).toBe(true);
    });

    it("advances to higher level when budget allows", () => {
      const report = composeReport([
        fixedEl("title", "T"),
        flexEl("resources", 5, 100, 50),
      ]);
      // Budget allows level 2 (200) but not level 3 (250)
      const result = report.render("markdown", 201);
      expect(result.output.length).toBe(201); // T + 200
      expect(result.truncated).toBe(true);
    });

    it("renders at max level when budget is sufficient", () => {
      const report = composeReport([
        fixedEl("title", "T"),
        flexEl("resources", 5, 100, 50),
      ]);
      // Budget allows level 4 (300)
      const result = report.render("markdown", 301);
      expect(result.output.length).toBe(301); // T + 300
      expect(result.truncated).toBe(false);
    });

    it("reports not truncated when all flex at max", () => {
      const report = composeReport([
        flexEl("resources", 3, 10, 5),
        flexEl("outputs", 3, 10, 5),
      ]);
      // level 2 for both = 20+20 = 40
      const result = report.render("markdown", 100);
      expect(result.truncated).toBe(false);
    });
  });

  describe("uniform phase", () => {
    it("advances all flex elements together", () => {
      const report = composeReport([
        flexEl("resources", 3, 10, 5), // 10, 15, 20
        flexEl("outputs", 3, 10, 5), // 10, 15, 20
      ]);
      // Budget = 30: uniform level 1 = 15+15=30 fits exactly
      // No room for individual upgrades (level 2 would be 20+15=35 > 30)
      const result = report.render("markdown", 30);
      expect(result.output.length).toBe(30);
      expect(result.truncated).toBe(true);
    });
  });

  describe("individual phase (priority order)", () => {
    it("upgrades resources before outputs before drift", () => {
      const report = composeReport([
        flexEl("drift", 3, 10, 100), // 10, 110, 210
        flexEl("resources", 3, 10, 100), // 10, 110, 210
        flexEl("outputs", 3, 10, 100), // 10, 110, 210
      ]);
      // All start at level 0: 30 total
      // Uniform phase: level 1 = 330, doesn't fit in 150
      // Individual phase: resources level 1 = 110, total = 10+110+10 = 130 ≤ 150 → upgrade
      // outputs level 1 = 110, total = 10+110+110 = 230 > 150 → skip
      const result = report.render("markdown", 150);
      expect(result.output.length).toBe(130);
      expect(result.truncated).toBe(true);
    });
  });

  describe("format-specific budgeting", () => {
    it("uses html sizes when rendering html", () => {
      const report = composeReport([
        flexElDualFormat("resources", 3, 10, 5, 2.0),
        // md: 10, 15, 20; html: 20, 30, 40
      ]);
      // Markdown at level 2: 20. HTML at level 2: 40
      const mdResult = report.render("markdown", 25);
      expect(mdResult.output.length).toBe(20);
      expect(mdResult.truncated).toBe(false);

      const htmlResult = report.render("html", 25);
      // HTML level 1 = 30 > 25, level 0 = 20 ≤ 25
      expect(htmlResult.output.length).toBe(20);
      expect(htmlResult.truncated).toBe(true);
    });
  });

  describe("size invariant", () => {
    it("output.length matches fullSize when no limit", () => {
      const report = composeReport([
        fixedEl("title", "# Title\n"),
        flexEl("resources", 5, 100, 50),
        flexEl("outputs", 3, 50, 25),
      ]);
      for (const fmt of ["markdown", "html"] as const) {
        const result = report.render(fmt);
        expect(result.output.length).toBe(report.fullSize(fmt));
      }
    });
  });

  describe("edge cases", () => {
    it("handles single fixed element", () => {
      const report = composeReport([fixedEl("title", "T")]);
      const result = report.render("markdown", 1);
      expect(result.output).toBe("T");
      expect(result.truncated).toBe(false);
    });

    it("handles single flex element with 1 level", () => {
      const el: ReportElement = {
        id: "single",
        fixed: false,
        levels: 1,
        size: () => 5,
        render: () => "hello",
      };
      const report = composeReport([el]);
      const result = report.render("markdown", 100);
      expect(result.output).toBe("hello");
      expect(result.truncated).toBe(false);
    });

    it("reports truncated when budget is less than level-0 total", () => {
      const report = composeReport([
        fixedEl("title", "TITLE"),
        flexEl("resources", 5, 100, 50),
      ]);
      // Budget is 50, but title(5) + resources(100) = 105 > 50
      const result = report.render("markdown", 50);
      expect(result.truncated).toBe(true);
    });

    it("empty flex elements are not truncated", () => {
      const emptyFlex: ReportElement = {
        id: "empty-cat",
        fixed: false,
        levels: 3,
        size: () => 0,
        render: () => "",
      };
      const report = composeReport([fixedEl("t", "T"), emptyFlex]);
      const result = report.render("markdown", 1);
      expect(result.output).toBe("T");
      expect(result.truncated).toBe(false);
    });

    it("handles mixed fixed and flex in display order", () => {
      const report = composeReport([
        fixedEl("title", "T"),
        fixedEl("summary", "S"),
        flexEl("drift", 2, 10, 10),
        flexEl("resources", 2, 10, 10),
        fixedEl("footer", "F"),
      ]);
      // No limit → everything at max: T + S + 20 + 20 + F = 43
      const result = report.render("markdown");
      expect(result.output).toBe(
        "T" + "S" + "x".repeat(20) + "x".repeat(20) + "F",
      );
      expect(result.truncated).toBe(false);
    });
  });

  describe("integration with real elements", () => {
    it("composes a structured report from buildReportElements", () => {
      const elements = buildReportElements(
        {
          title: "Plan: 1 to create",
          issues: [],
          steps: [],
          warnings: [],
          rawStdout: [],
          summary: { actions: [], failures: [] },
          resources: [
            {
              address: "null_resource.test",
              type: "null_resource",
              action: "create",
              actionReason: null,
              attributes: [],
              hasAttributeDetail: false,
              importId: null,
              movedFromAddress: null,
              allUnknownAfterApply: false,
              isSensitive: false,
            },
          ],
        },
        { title: "My Plan" },
      );

      const composed = composeReport(elements);

      // Full render should include title and resources
      for (const fmt of ["markdown", "html"] as const) {
        const full = composed.render(fmt);
        expect(full.output.length).toBe(composed.fullSize(fmt));
        expect(full.truncated).toBe(false);
        expect(full.output.length).toBeGreaterThan(0);
      }

      // Budget-constrained render — fixed elements (title + summary + user-title)
      // always render at full size; budget only constrains flex elements
      const fixedSize = elements
        .filter((e) => e.fixed || e.levels <= 1)
        .reduce((s, e) => s + e.size("markdown", e.levels - 1), 0);
      const tightBudget = fixedSize + 10;
      const tight = composed.render("markdown", tightBudget);
      expect(tight.output.length).toBeLessThanOrEqual(
        tightBudget + composed.fullSize("markdown"),
      );
      // Resources category exists with content, should be truncated at tight budget
      expect(tight.truncated).toBe(true);
    });
  });
});
