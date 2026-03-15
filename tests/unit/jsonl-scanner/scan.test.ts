import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanString, scanFile } from "../../../src/jsonl-scanner/scan.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Builds a JSONL string from an array of objects. */
function jsonl(...objects: Record<string, unknown>[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n");
}

function versionMessage(tool: "tofu" | "terraform" = "tofu"): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `${tool} 1.8.0`,
    "@module": `${tool}.ui`,
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "version",
    ...(tool === "tofu" ? { tofu: "1.8.0" } : { terraform: "1.8.0" }),
    ui: "1.2",
  };
}

function plannedChangeMessage(
  addr: string,
  action: string,
  resourceType = "null_resource",
  module = "",
): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `${addr}: Plan to ${action}`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "planned_change",
    change: {
      resource: {
        addr,
        module,
        resource: addr.replace(`${module}.`, ""),
        implied_provider: "null",
        resource_type: resourceType,
        resource_name: "test",
        resource_key: null,
      },
      action,
    },
  };
}

function changeSummaryMessage(
  add: number, change: number, remove: number,
  operation: "plan" | "apply" | "destroy" = "plan",
): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `Plan: ${String(add)} to add, ${String(change)} to change, ${String(remove)} to destroy.`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "change_summary",
    changes: { add, change, remove, import: 0, operation },
  };
}

function diagnosticMessage(
  severity: "error" | "warning",
  summary: string,
  detail = "",
): Record<string, unknown> {
  return {
    "@level": severity === "error" ? "error" : "warn",
    "@message": `${severity}: ${summary}`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "diagnostic",
    diagnostic: {
      severity,
      summary,
      detail,
    },
  };
}

function applyCompleteMessage(
  addr: string,
  action: string,
  elapsed: number,
): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `${addr}: Creation complete after ${String(elapsed)}s`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "apply_complete",
    hook: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: "null",
        resource_type: "null_resource",
        resource_name: "test",
        resource_key: null,
      },
      action,
      elapsed_seconds: elapsed,
      id_key: "id",
      id_value: "12345",
    },
  };
}

function applyErroredMessage(addr: string, action: string): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `${addr}: Apply errored`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "apply_errored",
    hook: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: "null",
        resource_type: "null_resource",
        resource_name: "test",
        resource_key: null,
      },
      action,
      elapsed_seconds: 1.5,
    },
  };
}

function outputsMessage(): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": "Outputs: 1",
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "outputs",
    outputs: {
      greeting: { sensitive: false, type: "string", value: "hello" },
      secret: { sensitive: true },
    },
  };
}

function driftMessage(addr: string, action: string): Record<string, unknown> {
  return {
    "@level": "info",
    "@message": `${addr}: Drift detected (${action})`,
    "@module": "tofu.ui",
    "@timestamp": "2024-01-01T00:00:00Z",
    type: "resource_drift",
    change: {
      resource: {
        addr,
        module: "",
        resource: addr,
        implied_provider: "null",
        resource_type: "null_resource",
        resource_name: "test",
        resource_key: null,
      },
      action,
    },
  };
}

// ─── scanString Tests ───────────────────────────────────────────────────────

describe("scanString", () => {
  it("returns empty result for empty input", () => {
    const result = scanString("");
    expect(result.plannedChanges).toEqual([]);
    expect(result.applyStatuses).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.driftChanges).toEqual([]);
    expect(result.changeSummary).toBeUndefined();
    expect(result.outputsMessage).toBeUndefined();
    expect(result.tool).toBeUndefined();
    expect(result.totalLines).toBe(0);
    expect(result.parsedLines).toBe(0);
    expect(result.unknownTypeLines).toBe(0);
    expect(result.unparseableLines).toBe(0);
  });

  it("detects tofu from version message", () => {
    const result = scanString(jsonl(versionMessage("tofu")));
    expect(result.tool).toBe("tofu");
    expect(result.parsedLines).toBe(1);
  });

  it("detects terraform from version message", () => {
    const result = scanString(jsonl(versionMessage("terraform")));
    expect(result.tool).toBe("terraform");
  });

  it("extracts planned changes", () => {
    const content = jsonl(
      versionMessage(),
      plannedChangeMessage("null_resource.a", "create"),
      plannedChangeMessage("null_resource.b", "delete"),
      plannedChangeMessage("module.child.null_resource.c", "update", "null_resource", "module.child"),
    );
    const result = scanString(content);
    expect(result.plannedChanges).toHaveLength(3);
    expect(result.plannedChanges[0]).toEqual({
      address: "null_resource.a",
      resourceType: "null_resource",
      module: "",
      action: "create",
    });
    expect(result.plannedChanges[1]).toEqual({
      address: "null_resource.b",
      resourceType: "null_resource",
      module: "",
      action: "delete",
    });
    expect(result.plannedChanges[2]).toEqual({
      address: "module.child.null_resource.c",
      resourceType: "null_resource",
      module: "module.child",
      action: "update",
    });
  });

  it("maps UI actions to PlanAction correctly", () => {
    const actions = [
      ["create", "create"],
      ["update", "update"],
      ["delete", "delete"],
      ["replace", "replace"],
      ["read", "read"],
      ["noop", "no-op"],
      ["forget", "forget"],
      ["remove", "forget"],
      ["move", "move"],
      ["import", "import"],
      ["unknown_action", "unknown"],
    ] as const;

    for (const [uiAction, expected] of actions) {
      const content = jsonl(plannedChangeMessage("null_resource.x", uiAction));
      const result = scanString(content);
      expect(result.plannedChanges[0]?.action).toBe(expected);
    }
  });

  it("extracts change summary", () => {
    const content = jsonl(
      versionMessage(),
      changeSummaryMessage(3, 1, 2, "plan"),
    );
    const result = scanString(content);
    expect(result.changeSummary).toBeDefined();
    expect(result.changeSummary?.add).toBe(3);
    expect(result.changeSummary?.change).toBe(1);
    expect(result.changeSummary?.remove).toBe(2);
    expect(result.changeSummary?.operation).toBe("plan");
  });

  it("last change_summary wins", () => {
    const content = jsonl(
      changeSummaryMessage(1, 0, 0, "plan"),
      changeSummaryMessage(5, 2, 1, "apply"),
    );
    const result = scanString(content);
    expect(result.changeSummary?.add).toBe(5);
    expect(result.changeSummary?.operation).toBe("apply");
  });

  it("extracts diagnostics", () => {
    const content = jsonl(
      diagnosticMessage("error", "Missing required argument", "The 'name' argument is required."),
      diagnosticMessage("warning", "Deprecated attribute", "Use 'new_name' instead."),
    );
    const result = scanString(content);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toEqual({
      severity: "error",
      summary: "Missing required argument",
      detail: "The 'name' argument is required.",
    });
    expect(result.diagnostics[1]?.severity).toBe("warning");
  });

  it("extracts diagnostic with range and snippet", () => {
    const content = jsonl({
      "@level": "error",
      "@message": "Error",
      "@module": "tofu.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "diagnostic",
      diagnostic: {
        severity: "error",
        summary: "Invalid reference",
        detail: "",
        range: {
          filename: "main.tf",
          start: { line: 10, column: 5, byte: 100 },
          end: { line: 10, column: 20, byte: 115 },
        },
        snippet: {
          context: 'resource "aws_instance" "web"',
          code: '  ami = var.ami_id',
          start_line: 10,
          highlight_start_offset: 8,
          highlight_end_offset: 18,
          values: [],
        },
      },
    });
    const result = scanString(content);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.range?.filename).toBe("main.tf");
    expect(result.diagnostics[0]?.snippet?.code).toBe('  ami = var.ami_id');
  });

  it("does not set diagnostic source (scanner is step-unaware)", () => {
    const content = jsonl(diagnosticMessage("error", "Test"));
    const result = scanString(content);
    expect(result.diagnostics[0]?.source).toBeUndefined();
  });

  it("extracts apply_complete statuses", () => {
    const content = jsonl(
      applyCompleteMessage("null_resource.a", "create", 2.5),
    );
    const result = scanString(content);
    expect(result.applyStatuses).toHaveLength(1);
    expect(result.applyStatuses[0]).toEqual({
      address: "null_resource.a",
      action: "create",
      success: true,
      elapsed: 2.5,
      idKey: "id",
      idValue: "12345",
    });
  });

  it("extracts apply_errored statuses", () => {
    const content = jsonl(
      applyErroredMessage("null_resource.fail", "create"),
    );
    const result = scanString(content);
    expect(result.applyStatuses).toHaveLength(1);
    expect(result.applyStatuses[0]).toEqual({
      address: "null_resource.fail",
      action: "create",
      success: false,
      elapsed: 1.5,
    });
  });

  it("last apply outcome per address wins (replace = delete + create)", () => {
    const content = jsonl(
      applyCompleteMessage("null_resource.x", "delete", 1.0),
      applyCompleteMessage("null_resource.x", "create", 3.0),
    );
    const result = scanString(content);
    expect(result.applyStatuses).toHaveLength(1);
    expect(result.applyStatuses[0]?.action).toBe("create");
    expect(result.applyStatuses[0]?.elapsed).toBe(3.0);
  });

  it("extracts outputs message", () => {
    const content = jsonl(outputsMessage());
    const result = scanString(content);
    expect(result.outputsMessage).toBeDefined();
    expect(result.outputsMessage?.outputs["greeting"]?.value).toBe("hello");
    expect(result.outputsMessage?.outputs["secret"]?.sensitive).toBe(true);
  });

  it("extracts resource drift", () => {
    const content = jsonl(driftMessage("null_resource.drifted", "update"));
    const result = scanString(content);
    expect(result.driftChanges).toHaveLength(1);
    expect(result.driftChanges[0]).toEqual({
      address: "null_resource.drifted",
      resourceType: "null_resource",
      module: "",
      action: "update",
    });
  });

  it("counts skippable types as parsed", () => {
    const content = jsonl(
      {
        "@level": "info", "@message": "log msg", "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:00Z", type: "log",
      },
      {
        "@level": "info", "@message": "start", "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:00Z", type: "apply_start",
        hook: { resource: { addr: "a" }, action: "create" },
      },
      {
        "@level": "info", "@message": "progress", "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:00Z", type: "apply_progress",
        hook: { resource: { addr: "a" }, action: "create", elapsed_seconds: 5 },
      },
    );
    const result = scanString(content);
    expect(result.parsedLines).toBe(3);
    expect(result.unknownTypeLines).toBe(0);
    expect(result.plannedChanges).toHaveLength(0);
    expect(result.applyStatuses).toHaveLength(0);
  });

  it("counts unknown type lines", () => {
    const content = jsonl(
      { type: "totally_new_type", data: 42 },
    );
    const result = scanString(content);
    expect(result.unknownTypeLines).toBe(1);
    expect(result.parsedLines).toBe(0);
  });

  it("counts unparseable lines", () => {
    const content = [
      "this is not json",
      '{"no_type_field": true}',
      "[1,2,3]",
      '{"type":"version","tofu":"1.8.0","ui":"1.2","@level":"info","@message":"v","@module":"tofu.ui","@timestamp":"2024-01-01T00:00:00Z"}',
    ].join("\n");
    const result = scanString(content);
    expect(result.unparseableLines).toBe(3);
    expect(result.parsedLines).toBe(1);
    expect(result.totalLines).toBe(4);
  });

  it("skips blank lines", () => {
    const content = "\n\n" + jsonl(versionMessage()) + "\n\n";
    const result = scanString(content);
    expect(result.totalLines).toBe(1);
    expect(result.parsedLines).toBe(1);
  });

  it("handles a full plan JSONL stream", () => {
    const content = jsonl(
      versionMessage(),
      plannedChangeMessage("null_resource.a", "create"),
      plannedChangeMessage("null_resource.b", "update"),
      plannedChangeMessage("null_resource.c", "delete"),
      driftMessage("null_resource.drifted", "update"),
      diagnosticMessage("warning", "Deprecated"),
      changeSummaryMessage(1, 1, 1, "plan"),
    );
    const result = scanString(content);
    expect(result.tool).toBe("tofu");
    expect(result.plannedChanges).toHaveLength(3);
    expect(result.driftChanges).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.changeSummary?.add).toBe(1);
    expect(result.parsedLines).toBe(7);
    expect(result.totalLines).toBe(7);
  });

  it("handles a full apply JSONL stream", () => {
    const content = jsonl(
      versionMessage(),
      plannedChangeMessage("null_resource.a", "create"),
      applyCompleteMessage("null_resource.a", "create", 1.0),
      diagnosticMessage("warning", "Something"),
      changeSummaryMessage(1, 0, 0, "apply"),
      outputsMessage(),
    );
    const result = scanString(content);
    expect(result.tool).toBe("tofu");
    expect(result.plannedChanges).toHaveLength(1);
    expect(result.applyStatuses).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.changeSummary?.operation).toBe("apply");
    expect(result.outputsMessage).toBeDefined();
    expect(result.parsedLines).toBe(6);
  });

  it("handles malformed planned_change gracefully (missing resource)", () => {
    const content = jsonl({
      "@level": "info", "@message": "x", "@module": "tofu.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "planned_change",
      change: { action: "create" },
    });
    const result = scanString(content);
    // Parsed as known type but extraction fails — still counted as parsed
    expect(result.parsedLines).toBe(1);
    expect(result.plannedChanges).toHaveLength(0);
  });

  it("handles malformed diagnostic gracefully (missing severity)", () => {
    const content = jsonl({
      "@level": "info", "@message": "x", "@module": "tofu.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "diagnostic",
      diagnostic: { summary: "test" },
    });
    const result = scanString(content);
    expect(result.parsedLines).toBe(1);
    expect(result.diagnostics).toHaveLength(0);
  });
});

// ─── scanFile Tests ─────────────────────────────────────────────────────────

describe("scanFile", () => {
  function writeTempFile(content: string): string {
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `scan-test-${String(Date.now())}-${String(Math.random())}.jsonl`);
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  it("scans a file with the same result as scanString", () => {
    const content = jsonl(
      versionMessage(),
      plannedChangeMessage("null_resource.a", "create"),
      changeSummaryMessage(1, 0, 0, "plan"),
    );
    const filePath = writeTempFile(content);
    try {
      const fileResult = scanFile(filePath, 256 * 1024 * 1024);
      const stringResult = scanString(content);
      expect(fileResult).toEqual(stringResult);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("returns empty result for files exceeding maxFileSize", () => {
    const content = jsonl(
      versionMessage(),
      plannedChangeMessage("null_resource.a", "create"),
    );
    const filePath = writeTempFile(content);
    try {
      const result = scanFile(filePath, 10); // 10 bytes max
      expect(result.totalLines).toBe(0);
      expect(result.plannedChanges).toHaveLength(0);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("handles files without trailing newline", () => {
    const content = JSON.stringify(versionMessage()); // No trailing \n
    const filePath = writeTempFile(content);
    try {
      const result = scanFile(filePath, 256 * 1024 * 1024);
      expect(result.tool).toBe("tofu");
      expect(result.parsedLines).toBe(1);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("handles lines spanning chunk boundaries", () => {
    // Create a line longer than CHUNK_SIZE (64KiB) by embedding a long message
    const longMessage = "x".repeat(70_000);
    const content = jsonl(
      versionMessage(),
      {
        "@level": "info",
        "@message": longMessage,
        "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:00Z",
        type: "log",
      },
      plannedChangeMessage("null_resource.a", "create"),
    );
    const filePath = writeTempFile(content);
    try {
      const result = scanFile(filePath, 256 * 1024 * 1024);
      expect(result.tool).toBe("tofu");
      expect(result.parsedLines).toBe(3);
      expect(result.plannedChanges).toHaveLength(1);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("handles empty file", () => {
    const filePath = writeTempFile("");
    try {
      const result = scanFile(filePath, 256 * 1024 * 1024);
      expect(result.totalLines).toBe(0);
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});
