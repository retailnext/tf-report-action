import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { reportFromSteps } from "../../src/index.js";
import type { ReportOptions } from "../../src/index.js";
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MINIMAL_PLAN = JSON.stringify({
  format_version: "1.2",
  terraform_version: "1.9.0",
  resource_changes: [
    {
      address: "null_resource.example",
      mode: "managed",
      type: "null_resource",
      name: "example",
      provider_name: "registry.terraform.io/hashicorp/null",
      change: {
        actions: ["create"],
        before: null,
        after: { id: null, triggers: null },
        after_unknown: { id: true },
        before_sensitive: {},
        after_sensitive: {},
      },
    },
  ],
  output_changes: {},
  configuration: { root_module: {} },
});

const NO_CHANGES_PLAN = JSON.stringify({
  format_version: "1.2",
  terraform_version: "1.9.0",
  resource_changes: [],
  output_changes: {},
  configuration: { root_module: {} },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(() => {
  tempDir = realpathSync(mkdtempSync(join(tmpdir(), "rfs-test-")));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

let fileCounter = 0;

/** Write a file directly inside tempDir and return its path. */
function writeFile(name: string, content: string): string {
  const uniqueName = `${String(fileCounter++)}-${name}`;
  const p = join(tempDir, uniqueName);
  writeFileSync(p, content, "utf-8");
  return p;
}

function stepsJson(steps: Record<string, unknown>): string {
  return JSON.stringify(steps);
}

function baseOpts(extra?: Partial<ReportOptions>): ReportOptions {
  return {
    allowedDirs: [tempDir],
    env: {},
    ...extra,
  };
}

// ─── 1. Invalid Inputs ─────────────────────────────────────────────────────

describe("invalid inputs", () => {
  it("returns markdown error for invalid JSON", () => {
    const result = reportFromSteps("{not valid json", baseOpts());
    expect(result).toContain("Report Generation Failed");
    expect(result).toContain("not valid JSON");
  });

  it("returns markdown error for empty string", () => {
    const result = reportFromSteps("", baseOpts());
    expect(result).toContain("Report Generation Failed");
  });

  it("returns general workflow for valid JSON array", () => {
    const result = reportFromSteps("[1,2,3]", baseOpts());
    expect(result).toContain("Report Generation Failed");
    expect(result).toContain("must be a JSON object");
  });

  it("returns markdown error for JSON number", () => {
    const result = reportFromSteps("42", baseOpts());
    expect(result).toContain("Report Generation Failed");
  });

  it("returns markdown error for JSON string", () => {
    const result = reportFromSteps('"hello"', baseOpts());
    expect(result).toContain("Report Generation Failed");
  });

  it("returns markdown error for JSON null", () => {
    const result = reportFromSteps("null", baseOpts());
    expect(result).toContain("Report Generation Failed");
  });

  it("never throws regardless of input", () => {
    const inputs = [
      "",
      "{{{{",
      "null",
      "42",
      '"string"',
      "[1]",
      '{"valid":"json"}',
    ];
    for (const input of inputs) {
      expect(() => reportFromSteps(input, baseOpts())).not.toThrow();
    }
  });
});

// ─── 2. Tier 4 — General Workflow ───────────────────────────────────────────

describe("tier 4 — general workflow", () => {
  it("renders report for empty steps {}", () => {
    const result = reportFromSteps(stepsJson({}), baseOpts());
    expect(result).toContain("Succeeded");
  });

  it("renders general workflow for unrecognized steps", () => {
    const result = reportFromSteps(
      stepsJson({
        checkout: { outcome: "success" },
        build: { outcome: "success" },
        test: { outcome: "success" },
      }),
      baseOpts(),
    );
    expect(result).toContain("Succeeded");
    expect(result).toContain("`checkout`");
    expect(result).toContain("`build`");
    expect(result).toContain("`test`");
    expect(result).toContain("| Step | Outcome |");
  });

  it("includes workspace prefix and marker", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({ workspace: "staging" }),
    );
    expect(result).toContain('<!-- tf-report-action:"staging" -->');
    expect(result).toContain("`staging`");
  });

  it("shows failure icon when a step has failed", () => {
    const result = reportFromSteps(
      stepsJson({
        checkout: { outcome: "failure" },
        deploy: { outcome: "success" },
      }),
      baseOpts(),
    );
    expect(result).toContain("❌");
    expect(result).toContain("Failed");
  });

  it("shows success icon when all steps succeed", () => {
    const result = reportFromSteps(
      stepsJson({
        checkout: { outcome: "success" },
        deploy: { outcome: "success" },
      }),
      baseOpts(),
    );
    expect(result).toContain("✅");
    expect(result).toContain("Succeeded");
  });

  it("includes logs URL when env vars are present", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: {
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "12345",
        },
      }),
    );
    expect(result).toContain(
      "https://github.com/owner/repo/actions/runs/12345/attempts/1",
    );
  });

  it("omits logs URL when env vars are missing", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({ env: {} }),
    );
    expect(result).not.toContain("View workflow run logs");
  });

  it("uses GITHUB_RUN_ATTEMPT when set", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: {
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "99",
          GITHUB_RUN_ATTEMPT: "3",
        },
      }),
    );
    expect(result).toContain("attempts/3");
  });

  it("handles steps with only conclusion (no outcome)", () => {
    const result = reportFromSteps(
      stepsJson({ deploy: { conclusion: "success" } }),
      baseOpts(),
    );
    expect(result).toContain("Succeeded");
    expect(result).toContain("success");
  });
});

// ─── 3. Tier 1 — Full Plan ─────────────────────────────────────────────────

describe("tier 1 — full structured plan", () => {
  it("renders structured plan from show-plan step", () => {
    const planFile = writeFile("plan.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("Plan:");
    expect(result).toContain("1 to add");
    expect(result).toContain("null_resource");
    expect(result).toContain("example");
  });

  it("renders no-changes plan", () => {
    const planFile = writeFile("no-changes.json", NO_CHANGES_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("No Changes");
    expect(result).toContain("✅");
  });

  it("renders plan with workspace prefix in title", () => {
    const planFile = writeFile("ws-plan.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ workspace: "myws" }),
    );
    expect(result).toContain("`myws` Plan:");
  });

  it("renders apply report when apply step is present", () => {
    const planFile = writeFile("apply-plan.json", MINIMAL_PLAN);
    // Minimal apply JSONL — empty is fine, the function handles gracefully
    const applyFile = writeFile("apply.jsonl", "");
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
        apply: {
          outcome: "success",
          outputs: { stdout_file: applyFile },
        },
      }),
      baseOpts(),
    );
    // Apply mode was entered (title reflects apply, not plan)
    expect(result).toContain("Apply");
  });

  it("falls back to plan when apply step is skipped", () => {
    const planFile = writeFile("skipped-apply.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
        apply: {
          outcome: "skipped",
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("Plan:");
    expect(result).not.toContain("Apply");
  });

  it("uses custom step IDs", () => {
    const planFile = writeFile("custom-step.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "my-show": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ showPlanStep: "my-show" }),
    );
    expect(result).toContain("Plan:");
    expect(result).toContain("1 to add");
  });
});

// ─── 4. Tier 3 — Text Fallback ─────────────────────────────────────────────

describe("tier 3 — text fallback", () => {
  it("shows text fallback when plan step present but no show-plan", () => {
    const stdoutFile = writeFile("plan-stdout.txt", "Plan: 2 to add");
    const result = reportFromSteps(
      stepsJson({
        plan: {
          outcome: "success",
          outputs: { stdout_file: stdoutFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("show -json <tfplan>");
    expect(result).toContain("was not available");
    expect(result).toContain("Plan: 2 to add");
  });

  it("shows plan output in code block", () => {
    const stdoutFile = writeFile("plan-code.txt", "resource changes here");
    const result = reportFromSteps(
      stepsJson({
        plan: {
          outcome: "success",
          outputs: { stdout_file: stdoutFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("### Plan Output");
    expect(result).toContain("```\nresource changes here\n```");
  });

  it("falls back to tier 3 when show-plan step has failure outcome", () => {
    const planStdout = writeFile("plan-fallback.txt", "some plan text");
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "failure",
          outputs: { stdout_file: writeFile("bad-show.json", "invalid") },
        },
        plan: {
          outcome: "success",
          outputs: { stdout_file: planStdout },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("show -json <tfplan>");
    expect(result).toContain("was not available");
    expect(result).toContain("some plan text");
  });

  it("labels as Apply when apply step output is present", () => {
    const applyFile = writeFile("apply-fallback.txt", "apply output here");
    const result = reportFromSteps(
      stepsJson({
        apply: {
          outcome: "success",
          outputs: { stdout_file: applyFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("Apply");
    expect(result).toContain("### Apply Output");
  });
});

// ─── 5. Workspace Marker ────────────────────────────────────────────────────

describe("workspace marker", () => {
  it("inserts HTML comment marker when workspace is set", () => {
    const planFile = writeFile("ws-marker.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ workspace: "prod" }),
    );
    expect(result).toMatch(/^<!-- tf-report-action:"prod" -->/);
  });

  it("omits marker when workspace is not set", () => {
    const planFile = writeFile("no-ws-marker.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).not.toContain("<!-- tf-report-action:");
  });

  it("escapes double quotes in workspace name", () => {
    const result = reportFromSteps(
      stepsJson({}),
      baseOpts({ workspace: 'my"ws' }),
    );
    expect(result).toContain('<!-- tf-report-action:"my\\"ws" -->');
  });

  it("escapes backslashes in workspace name", () => {
    const result = reportFromSteps(
      stepsJson({}),
      baseOpts({ workspace: "my\\ws" }),
    );
    expect(result).toContain('<!-- tf-report-action:"my\\\\ws" -->');
  });

  it("escapes --> in workspace name", () => {
    const result = reportFromSteps(
      stepsJson({}),
      baseOpts({ workspace: "a-->b" }),
    );
    expect(result).toContain("a--\\>b");
    // Must not contain unescaped --> inside the comment
    expect(result).not.toMatch(/<!-- tf-report-action:"[^"]*(?<!\\)-->"[^>]*-->/);
  });

  it("escapes --!> in workspace name", () => {
    const result = reportFromSteps(
      stepsJson({}),
      baseOpts({ workspace: "a--!>b" }),
    );
    expect(result).toContain("a--!\\>b");
  });
});

// ─── 6. Dynamic Titles ──────────────────────────────────────────────────────

describe("dynamic titles", () => {
  it("plan with changes: ✅ Plan: 1 to add", () => {
    const planFile = writeFile("title-add.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("✅ Plan:");
    expect(result).toContain("1 to add");
  });

  it("plan with no changes: ✅ No Changes", () => {
    const planFile = writeFile("title-nochange.json", NO_CHANGES_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("✅ No Changes");
  });

  it("plan with workspace: ✅ `myws` Plan:", () => {
    const planFile = writeFile("title-ws.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ workspace: "myws" }),
    );
    expect(result).toContain("✅ `myws` Plan:");
  });

  it("no-changes with workspace: ✅ `myws` No Changes", () => {
    const planFile = writeFile("title-ws-nochg.json", NO_CHANGES_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ workspace: "myws" }),
    );
    expect(result).toContain("✅ `myws` No Changes");
  });

  it("general workflow failure: ❌ Failed", () => {
    const result = reportFromSteps(
      stepsJson({ deploy: { outcome: "failure" } }),
      baseOpts(),
    );
    expect(result).toContain("❌");
    expect(result).toContain("Failed");
  });

  it("general workflow success: ✅ Succeeded", () => {
    const result = reportFromSteps(
      stepsJson({ deploy: { outcome: "success" } }),
      baseOpts(),
    );
    expect(result).toContain("✅");
    expect(result).toContain("Succeeded");
  });
});

// ─── 7. Output Size Limits ──────────────────────────────────────────────────

describe("output size limits", () => {
  it("truncates output when maxOutputLength is very small", () => {
    const planFile = writeFile("trunc-plan.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ maxOutputLength: 200 }),
    );
    expect(result.length).toBeLessThanOrEqual(400);
  });

  it("includes truncation notice when content is degraded", () => {
    const planFile = writeFile("trunc-notice.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ maxOutputLength: 300 }),
    );
    expect(result).toContain("Output truncated");
  });

  it("includes logs link in truncation notice when env vars set", () => {
    const planFile = writeFile("trunc-logs.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({
        maxOutputLength: 300,
        env: {
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_RUN_ID: "42",
        },
      }),
    );
    expect(result).toContain("Output truncated");
    expect(result).toContain("View full workflow run logs");
  });

  it("does not add truncation notice when content fits", () => {
    const planFile = writeFile("no-trunc.json", NO_CHANGES_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ maxOutputLength: 65536 }),
    );
    expect(result).not.toContain("Output truncated");
  });
});

// ─── 8. Failed Init/Validate ────────────────────────────────────────────────

describe("failed init/validate", () => {
  it("shows workflow issue section when init step failed", () => {
    const planFile = writeFile("init-fail-plan.json", MINIMAL_PLAN);
    const stderrFile = writeFile("init-stderr.txt", "Error: provider not found");
    const result = reportFromSteps(
      stepsJson({
        init: {
          outcome: "failure",
          outputs: { stderr_file: stderrFile },
        },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("`init` failed");
    expect(result).toContain("provider not found");
    expect(result).toContain("❌");
  });

  it("shows workflow issue section when validate step failed", () => {
    const planFile = writeFile("val-fail-plan.json", MINIMAL_PLAN);
    const stderrFile = writeFile("val-stderr.txt", "Error: invalid config");
    const result = reportFromSteps(
      stepsJson({
        validate: {
          outcome: "failure",
          outputs: { stderr_file: stderrFile },
        },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("`validate` failed");
    expect(result).toContain("invalid config");
  });

  it("shows failure icon in title when init failed", () => {
    const planFile = writeFile("init-fail-icon.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        init: { outcome: "failure" },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("❌");
    expect(result).toContain("Plan Failed");
  });

  it("shows 'No output captured' when failed step has no stdout/stderr files", () => {
    const planFile = writeFile("no-output.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        init: { outcome: "failure" },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("`init` failed");
    expect(result).toContain("No output captured");
  });

  it("includes stdout from failed init when available", () => {
    const planFile = writeFile("init-stdout.json", MINIMAL_PLAN);
    const stdoutFile = writeFile("init-stdout.txt", "Initializing backend...");
    const result = reportFromSteps(
      stepsJson({
        init: {
          outcome: "failure",
          outputs: { stdout_file: stdoutFile },
        },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).toContain("Initializing backend...");
  });

  it("uses custom init/validate step IDs", () => {
    const planFile = writeFile("custom-init.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        "my-init": { outcome: "failure" },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts({ initStep: "my-init" }),
    );
    expect(result).toContain("`my-init` failed");
  });

  it("does not flag init as issue when it succeeded", () => {
    const planFile = writeFile("init-ok.json", MINIMAL_PLAN);
    const result = reportFromSteps(
      stepsJson({
        init: { outcome: "success" },
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: planFile },
        },
      }),
      baseOpts(),
    );
    expect(result).not.toContain("`init` failed");
  });
});

// ─── 9. Logs URL ────────────────────────────────────────────────────────────

describe("logs URL", () => {
  it("includes link when GITHUB_REPOSITORY and GITHUB_RUN_ID are set", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: {
          GITHUB_REPOSITORY: "myorg/myrepo",
          GITHUB_RUN_ID: "555",
        },
      }),
    );
    expect(result).toContain(
      "https://github.com/myorg/myrepo/actions/runs/555/attempts/1",
    );
  });

  it("omits link when GITHUB_REPOSITORY is missing", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: { GITHUB_RUN_ID: "555" },
      }),
    );
    expect(result).not.toContain("View workflow run logs");
  });

  it("omits link when GITHUB_RUN_ID is missing", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: { GITHUB_REPOSITORY: "myorg/myrepo" },
      }),
    );
    expect(result).not.toContain("View workflow run logs");
  });

  it("defaults attempt to 1 when GITHUB_RUN_ATTEMPT is not set", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: {
          GITHUB_REPOSITORY: "myorg/myrepo",
          GITHUB_RUN_ID: "555",
        },
      }),
    );
    expect(result).toContain("attempts/1");
  });

  it("uses GITHUB_RUN_ATTEMPT when set", () => {
    const result = reportFromSteps(
      stepsJson({ checkout: { outcome: "success" } }),
      baseOpts({
        env: {
          GITHUB_REPOSITORY: "myorg/myrepo",
          GITHUB_RUN_ID: "555",
          GITHUB_RUN_ATTEMPT: "7",
        },
      }),
    );
    expect(result).toContain("attempts/7");
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles show-plan step with no outputs", () => {
    const result = reportFromSteps(
      stepsJson({
        "show-plan": { outcome: "success" },
      }),
      baseOpts(),
    );
    // Falls back because no stdout_file output → tier 4
    expect(result).toContain("Succeeded");
  });

  it("handles show-plan step with missing file", () => {
    const result = reportFromSteps(
      stepsJson({
        "show-plan": {
          outcome: "success",
          outputs: { stdout_file: "/nonexistent/path/plan.json" },
        },
      }),
      baseOpts(),
    );
    // Can't read file → tier 4 (general workflow)
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });

  it("handles step with empty outputs object", () => {
    const result = reportFromSteps(
      stepsJson({
        "show-plan": { outcome: "success", outputs: {} },
      }),
      baseOpts(),
    );
    expect(result).toBeDefined();
  });

  it("handles steps with no outcome or conclusion", () => {
    const result = reportFromSteps(
      stepsJson({
        checkout: {},
      }),
      baseOpts(),
    );
    expect(result).toContain("unknown");
  });

  it("produces valid output when called with no options", () => {
    const result = reportFromSteps(stepsJson({}));
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
