import { describe, it, expect } from "vitest";
import { parseUILog } from "../../src/parser/ui-log.js";
import type {
  UIVersionMessage,
  UIPlannedChangeMessage,
  UIApplyCompleteMessage,
  UIDiagnosticMessage,
  UIOutputsMessage,
  UIChangeSummaryMessage,
  UILogMessage,
  UIApplyErroredMessage,
  UIProvisionStartMessage,
} from "../../src/tfjson/machine-readable-ui.js";

describe("parseUILog", () => {
  it("parses an empty string to an empty array", () => {
    expect(parseUILog("")).toEqual([]);
  });

  it("skips blank lines and whitespace-only lines", () => {
    const input = "\n  \n\t\n";
    expect(parseUILog(input)).toEqual([]);
  });

  it("parses a single version message", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "Terraform 1.9.0",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "version",
      terraform: "1.9.0",
      ui: "1.2",
    });
    const messages = parseUILog(line);
    expect(messages).toHaveLength(1);
    const msg = messages[0] as UIVersionMessage;
    expect(msg.type).toBe("version");
    expect(msg.terraform).toBe("1.9.0");
    expect(msg.ui).toBe("1.2");
  });

  it("parses multiple message types in sequence", () => {
    const lines = [
      JSON.stringify({
        "@level": "info",
        "@message": "OpenTofu 1.11.5",
        "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:00Z",
        type: "version",
        tofu: "1.11.5",
        ui: "1.2",
      }),
      JSON.stringify({
        "@level": "info",
        "@message": "null_resource.example: Plan to update",
        "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:01Z",
        type: "planned_change",
        change: {
          resource: {
            addr: "null_resource.example",
            module: "",
            resource: "null_resource.example",
            implied_provider: "null",
            resource_type: "null_resource",
            resource_name: "example",
            resource_key: null,
          },
          action: "update",
        },
      }),
      JSON.stringify({
        "@level": "info",
        "@message": "Apply complete!",
        "@module": "tofu.ui",
        "@timestamp": "2024-01-01T00:00:02Z",
        type: "apply_complete",
        hook: {
          resource: {
            addr: "null_resource.example",
            module: "",
            resource: "null_resource.example",
            implied_provider: "null",
            resource_type: "null_resource",
            resource_name: "example",
            resource_key: null,
          },
          action: "update",
          elapsed_seconds: 0,
        },
      }),
    ].join("\n");

    const messages = parseUILog(lines);
    expect(messages).toHaveLength(3);
    expect(messages[0]!.type).toBe("version");
    expect(messages[1]!.type).toBe("planned_change");
    expect(messages[2]!.type).toBe("apply_complete");

    const planned = messages[1] as UIPlannedChangeMessage;
    expect(planned.change.resource.addr).toBe("null_resource.example");
    expect(planned.change.action).toBe("update");

    const complete = messages[2] as UIApplyCompleteMessage;
    expect(complete.hook.elapsed_seconds).toBe(0);
  });

  it("parses diagnostic messages", () => {
    const line = JSON.stringify({
      "@level": "error",
      "@message": "Error: something went wrong",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "diagnostic",
      diagnostic: {
        severity: "error",
        summary: "something went wrong",
        detail: "detailed explanation",
        address: "null_resource.example",
      },
    });
    const messages = parseUILog(line);
    expect(messages).toHaveLength(1);
    const msg = messages[0] as UIDiagnosticMessage;
    expect(msg.type).toBe("diagnostic");
    expect(msg.diagnostic.severity).toBe("error");
    expect(msg.diagnostic.summary).toBe("something went wrong");
    expect(msg.diagnostic.address).toBe("null_resource.example");
  });

  it("parses outputs messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "Outputs: 1",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "outputs",
      outputs: {
        my_output: {
          sensitive: false,
          type: "string",
          value: "hello",
        },
        secret: {
          sensitive: true,
        },
      },
    });
    const messages = parseUILog(line);
    expect(messages).toHaveLength(1);
    const msg = messages[0] as UIOutputsMessage;
    expect(msg.type).toBe("outputs");
    expect(msg.outputs["my_output"]?.value).toBe("hello");
    expect(msg.outputs["secret"]?.sensitive).toBe(true);
    expect(msg.outputs["secret"]?.value).toBeUndefined();
  });

  it("parses change_summary messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "Apply complete! Resources: 1 added, 0 changed, 0 destroyed.",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "change_summary",
      changes: {
        add: 1,
        change: 0,
        import: 0,
        remove: 0,
        operation: "apply",
      },
    });
    const messages = parseUILog(line);
    const msg = messages[0] as UIChangeSummaryMessage;
    expect(msg.changes.add).toBe(1);
    expect(msg.changes.operation).toBe("apply");
  });

  it("parses log messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "some informational message",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "log",
    });
    const messages = parseUILog(line);
    const msg = messages[0] as UILogMessage;
    expect(msg.type).toBe("log");
    expect(msg["@message"]).toBe("some informational message");
  });

  it("parses apply_errored messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "null_resource.fail: Creation errored after 0s",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "apply_errored",
      hook: {
        resource: {
          addr: "null_resource.fail",
          module: "",
          resource: "null_resource.fail",
          implied_provider: "null",
          resource_type: "null_resource",
          resource_name: "fail",
          resource_key: null,
        },
        action: "create",
        elapsed_seconds: 0,
      },
    });
    const messages = parseUILog(line);
    const msg = messages[0] as UIApplyErroredMessage;
    expect(msg.type).toBe("apply_errored");
    expect(msg.hook.resource.addr).toBe("null_resource.fail");
    expect(msg.hook.action).toBe("create");
  });

  it("parses provisioner messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "null_resource.example: Provisioning with 'local-exec'...",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "provision_start",
      hook: {
        resource: {
          addr: "null_resource.example",
          module: "",
          resource: "null_resource.example",
          implied_provider: "null",
          resource_type: "null_resource",
          resource_name: "example",
          resource_key: null,
        },
        provisioner: "local-exec",
      },
    });
    const messages = parseUILog(line);
    const msg = messages[0] as UIProvisionStartMessage;
    expect(msg.type).toBe("provision_start");
    expect(msg.hook.provisioner).toBe("local-exec");
  });

  it("preserves unknown message types as UIUnknownMessage", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "something new",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "future_message_type",
      some_field: "some_value",
    });
    const messages = parseUILog(line);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("future_message_type");
  });

  it("handles trailing newline without producing extra messages", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "test",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "log",
    });
    const messages = parseUILog(line + "\n");
    expect(messages).toHaveLength(1);
  });

  it("handles mixed blank lines between messages", () => {
    const msg = JSON.stringify({
      "@level": "info",
      "@message": "test",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: "log",
    });
    const input = `\n${msg}\n\n${msg}\n  \n`;
    const messages = parseUILog(input);
    expect(messages).toHaveLength(2);
  });

  // Error handling

  it("throws on invalid JSON with line number", () => {
    const input = '{"type":"log"}\nnot json\n{"type":"log"}';
    expect(() => parseUILog(input)).toThrowError(/line 2/);
  });

  it("does not expose line content in error messages", () => {
    const sensitiveContent = '{"secret":"s3cr3t_pass_abc123"garbage';
    try {
      parseUILog(sensitiveContent);
      expect.fail("Should have thrown");
    } catch (err) {
      const msg = String(err);
      expect(msg).not.toContain("s3cr3t_pass_abc123");
      expect(msg).not.toContain("garbage");
    }
  });

  it("throws when a line is a JSON array", () => {
    expect(() => parseUILog("[1,2,3]")).toThrowError(/not a JSON object/);
  });

  it("throws when a line is a JSON string", () => {
    expect(() => parseUILog('"hello"')).toThrowError(/not a JSON object/);
  });

  it("throws when a line is a JSON number", () => {
    expect(() => parseUILog("42")).toThrowError(/not a JSON object/);
  });

  it("throws when type field is missing", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "no type",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
    });
    expect(() => parseUILog(line)).toThrowError(/type/);
  });

  it("throws when type field is not a string", () => {
    const line = JSON.stringify({
      "@level": "info",
      "@message": "bad type",
      "@module": "terraform.ui",
      "@timestamp": "2024-01-01T00:00:00Z",
      type: 42,
    });
    expect(() => parseUILog(line)).toThrowError(/type/);
  });
});
