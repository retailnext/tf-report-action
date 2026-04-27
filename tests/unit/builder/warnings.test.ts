import { describe, expect, it } from "vitest";
import type { OutputFormat } from "../../../src/renderable/types.js";
import {
  NoShowPlanWarning,
  RawTextFallbackWarning,
  NoStateWarning,
  StepOutputParseWarning,
  StepReadErrorWarning,
  StepOutputMissingWarning,
  StepScanFailureWarning,
  UnparseableLinesWarning,
  UnknownMessageTypesWarning,
} from "../../../src/builder/warnings.js";

/** Assert that size() matches render().length for both formats. */
function assertSizeInvariant(w: {
  size: (f: OutputFormat) => number;
  render: (f: OutputFormat) => string;
}): void {
  for (const format of ["markdown", "html"] as const) {
    expect(w.size(format)).toBe(w.render(format).length);
  }
}

// ---------------------------------------------------------------------------
// NoShowPlanWarning
// ---------------------------------------------------------------------------

describe("NoShowPlanWarning", () => {
  it("renders the command as code in markdown", () => {
    const w = new NoShowPlanWarning("terraform");
    const md = w.render("markdown");
    expect(md).toContain("`terraform show -json <tfplan>`");
    expect(md).toContain("Resource attribute details are not available.");
  });

  it("renders the command as <code> in HTML", () => {
    const w = new NoShowPlanWarning("terraform");
    const html = w.render("html");
    expect(html).toContain("<code>terraform show -json &lt;tfplan&gt;</code>");
    expect(html).toContain("Resource attribute details are not available.");
  });

  it("uses tofu when tool is tofu", () => {
    const w = new NoShowPlanWarning("tofu");
    expect(w.render("markdown")).toContain("`tofu show -json <tfplan>`");
    expect(w.render("html")).toContain(
      "<code>tofu show -json &lt;tfplan&gt;</code>",
    );
  });

  it("uses generic command when tool is undefined", () => {
    const w = new NoShowPlanWarning(undefined);
    const md = w.render("markdown");
    expect(md).toContain("`show -json <tfplan>`");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new NoShowPlanWarning("terraform"));
    assertSizeInvariant(new NoShowPlanWarning("tofu"));
    assertSizeInvariant(new NoShowPlanWarning(undefined));
  });
});

// ---------------------------------------------------------------------------
// RawTextFallbackWarning
// ---------------------------------------------------------------------------

describe("RawTextFallbackWarning", () => {
  it("renders the command as code in markdown", () => {
    const w = new RawTextFallbackWarning("tofu");
    const md = w.render("markdown");
    expect(md).toContain("`tofu show -json <tfplan>`");
    expect(md).toContain("Showing raw command output.");
  });

  it("renders the command as <code> in HTML", () => {
    const w = new RawTextFallbackWarning("tofu");
    const html = w.render("html");
    expect(html).toContain("<code>tofu show -json &lt;tfplan&gt;</code>");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new RawTextFallbackWarning("terraform"));
    assertSizeInvariant(new RawTextFallbackWarning("tofu"));
  });
});

// ---------------------------------------------------------------------------
// NoStateWarning
// ---------------------------------------------------------------------------

describe("NoStateWarning", () => {
  it("renders the command as code in markdown", () => {
    const w = new NoStateWarning("terraform");
    const md = w.render("markdown");
    expect(md).toContain("`terraform state pull`");
    expect(md).toContain("Add a state step after apply");
  });

  it("renders the command as <code> in HTML", () => {
    const w = new NoStateWarning("terraform");
    const html = w.render("html");
    expect(html).toContain("<code>terraform state pull</code>");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new NoStateWarning("terraform"));
    assertSizeInvariant(new NoStateWarning("tofu"));
  });
});

// ---------------------------------------------------------------------------
// StepOutputParseWarning
// ---------------------------------------------------------------------------

describe("StepOutputParseWarning", () => {
  it("renders the step ID as code in markdown", () => {
    const w = new StepOutputParseWarning("apply");
    const md = w.render("markdown");
    expect(md).toContain("`apply`");
    expect(md).toContain("could not be parsed");
  });

  it("renders the step ID as <code> in HTML", () => {
    const w = new StepOutputParseWarning("apply");
    const html = w.render("html");
    expect(html).toContain("<code>apply</code>");
  });

  it("escapes HTML in step ID", () => {
    const w = new StepOutputParseWarning("<script>");
    const html = w.render("html");
    expect(html).toContain("<code>&lt;script&gt;</code>");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new StepOutputParseWarning("apply"));
    assertSizeInvariant(new StepOutputParseWarning("<special>"));
  });
});

// ---------------------------------------------------------------------------
// StepReadErrorWarning
// ---------------------------------------------------------------------------

describe("StepReadErrorWarning", () => {
  it("renders role and error in markdown", () => {
    const w = new StepReadErrorWarning("apply", "file not found");
    expect(w.render("markdown")).toBe("apply stdout: file not found");
  });

  it("escapes error in HTML", () => {
    const w = new StepReadErrorWarning("plan", "path <invalid>");
    const html = w.render("html");
    expect(html).toContain("&lt;invalid&gt;");
    expect(html).toBe("plan stdout: path &lt;invalid&gt;");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new StepReadErrorWarning("apply", "error msg"));
    assertSizeInvariant(
      new StepReadErrorWarning("show-plan", "contains <html>"),
    );
  });
});

// ---------------------------------------------------------------------------
// StepOutputMissingWarning
// ---------------------------------------------------------------------------

describe("StepOutputMissingWarning", () => {
  it("renders role with missing message", () => {
    const w = new StepOutputMissingWarning("apply");
    expect(w.render("markdown")).toBe(
      "apply: stdout_file output missing in steps",
    );
    expect(w.render("html")).toBe("apply: stdout_file output missing in steps");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new StepOutputMissingWarning("plan"));
    assertSizeInvariant(new StepOutputMissingWarning("show-plan"));
  });
});

// ---------------------------------------------------------------------------
// StepScanFailureWarning
// ---------------------------------------------------------------------------

describe("StepScanFailureWarning", () => {
  it("capitalizes the role", () => {
    const w = new StepScanFailureWarning("apply");
    expect(w.render("markdown")).toBe("Apply JSONL file could not be scanned");
  });

  it("capitalizes plan role", () => {
    const w = new StepScanFailureWarning("plan");
    expect(w.render("markdown")).toBe("Plan JSONL file could not be scanned");
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new StepScanFailureWarning("apply"));
    assertSizeInvariant(new StepScanFailureWarning("plan"));
  });
});

// ---------------------------------------------------------------------------
// UnparseableLinesWarning
// ---------------------------------------------------------------------------

describe("UnparseableLinesWarning", () => {
  it("renders count and role", () => {
    const w = new UnparseableLinesWarning(5, "apply");
    expect(w.render("markdown")).toBe(
      "5 line(s) in apply output could not be parsed as JSON",
    );
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new UnparseableLinesWarning(1, "plan"));
    assertSizeInvariant(new UnparseableLinesWarning(42, "apply"));
  });
});

// ---------------------------------------------------------------------------
// UnknownMessageTypesWarning
// ---------------------------------------------------------------------------

describe("UnknownMessageTypesWarning", () => {
  it("renders count and role", () => {
    const w = new UnknownMessageTypesWarning(3, "plan");
    expect(w.render("markdown")).toBe(
      "3 line(s) in plan output had unrecognized message types",
    );
  });

  it("satisfies size invariant", () => {
    assertSizeInvariant(new UnknownMessageTypesWarning(1, "apply"));
    assertSizeInvariant(new UnknownMessageTypesWarning(10, "plan"));
  });
});
