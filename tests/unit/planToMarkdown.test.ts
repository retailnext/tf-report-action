import { describe, it, expect } from "vitest";
import { planToMarkdown } from "../../src/index.js";

/** Minimal valid plan JSON used as a baseline across tests. */
const EMPTY_PLAN = JSON.stringify({
  format_version: "1.2",
  terraform_version: "1.9.0",
  resource_changes: [],
});

const CREATE_PLAN = JSON.stringify({
  format_version: "1.2",
  terraform_version: "1.9.0",
  resource_changes: [
    {
      address: "null_resource.example",
      mode: "managed",
      type: "null_resource",
      name: "example",
      change: {
        actions: ["create"],
        before: null,
        after: { id: null, triggers: null },
        before_sensitive: false,
        after_sensitive: false,
        after_unknown: { id: true },
      },
    },
  ],
});

const SENSITIVE_PLAN = JSON.stringify({
  format_version: "1.2",
  resource_changes: [
    {
      address: "null_resource.secret_holder",
      mode: "managed",
      type: "null_resource",
      name: "secret_holder",
      change: {
        actions: ["update"],
        before: { password: "old_s3cr3t", username: "admin" },
        after: { password: "new_s3cr3t", username: "admin" },
        before_sensitive: { password: true },
        after_sensitive: { password: true },
        after_unknown: false,
      },
    },
  ],
});

const MULTI_MODULE_PLAN = JSON.stringify({
  format_version: "1.2",
  resource_changes: [
    {
      address: "null_resource.root",
      mode: "managed",
      type: "null_resource",
      name: "root",
      change: {
        actions: ["create"],
        before: null,
        after: {},
        before_sensitive: false,
        after_sensitive: false,
        after_unknown: false,
      },
    },
    {
      address: "module.child.null_resource.nested",
      module_address: "module.child",
      mode: "managed",
      type: "null_resource",
      name: "nested",
      change: {
        actions: ["delete"],
        before: {},
        after: null,
        before_sensitive: false,
        after_sensitive: false,
        after_unknown: false,
      },
    },
  ],
});

describe("planToMarkdown", () => {
  describe("basic output structure", () => {
    it("returns a non-empty markdown string", () => {
      const result = planToMarkdown(EMPTY_PLAN);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("includes a Plan Summary heading", () => {
      expect(planToMarkdown(EMPTY_PLAN)).toContain("Plan Summary");
    });

    it("includes a summary table", () => {
      expect(planToMarkdown(EMPTY_PLAN)).toContain("| Action | Count |");
    });

    it("shows Total row even for empty plan", () => {
      const result = planToMarkdown(EMPTY_PLAN);
      expect(result).toContain("Total");
      expect(result).toContain("**0**");
    });
  });

  describe("resource changes", () => {
    it("shows create action for new resource", () => {
      const result = planToMarkdown(CREATE_PLAN);
      expect(result).toContain("➕");
    });

    it("shows resource type and name", () => {
      const result = planToMarkdown(CREATE_PLAN);
      expect(result).toContain("null_resource");
      expect(result).toContain("example");
    });

    it("includes resource change details section", () => {
      const result = planToMarkdown(CREATE_PLAN);
      expect(result).toContain("Resource Changes");
    });

    it("wraps resource details in collapsible block", () => {
      const result = planToMarkdown(CREATE_PLAN);
      expect(result).toContain("<details>");
      expect(result).toContain("</details>");
    });
  });

  describe("sensitive value masking", () => {
    it("masks sensitive attribute values", () => {
      const result = planToMarkdown(SENSITIVE_PLAN);
      expect(result).toContain("(sensitive)");
    });

    it("does not expose the raw sensitive value", () => {
      const result = planToMarkdown(SENSITIVE_PLAN);
      expect(result).not.toContain("old_s3cr3t");
      expect(result).not.toContain("new_s3cr3t");
    });

    it("shows non-sensitive attributes normally", () => {
      // username is not sensitive and unchanged — only shown with showUnchangedAttributes
      const resultWithAll = planToMarkdown(SENSITIVE_PLAN, { showUnchangedAttributes: true });
      expect(resultWithAll).toContain("username");
    });
  });

  describe("module grouping", () => {
    it("shows root module group", () => {
      const result = planToMarkdown(MULTI_MODULE_PLAN);
      expect(result).toContain("root");
    });

    it("shows child module group", () => {
      const result = planToMarkdown(MULTI_MODULE_PLAN);
      expect(result).toContain("module.child");
    });

    it("uses module headings", () => {
      const result = planToMarkdown(MULTI_MODULE_PLAN);
      expect(result).toContain("Module");
    });
  });

  describe("options", () => {
    it("uses summary template when specified", () => {
      const result = planToMarkdown(CREATE_PLAN, { template: "summary" });
      expect(result).toContain("Plan Summary");
      // Summary template should not have resource details
      expect(result).not.toContain("<details>");
    });

    it("includes custom title heading when title is provided", () => {
      const result = planToMarkdown(EMPTY_PLAN, { title: "My Custom Title" });
      expect(result).toContain("My Custom Title");
    });

    it("uses simple diff format when specified", () => {
      const plan = JSON.stringify({
        format_version: "1.2",
        resource_changes: [
          {
            address: "null_resource.test",
            mode: "managed",
            type: "null_resource",
            name: "test",
            change: {
              actions: ["update"],
              before: { name: "old" },
              after: { name: "new" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          },
        ],
      });
      const result = planToMarkdown(plan, { diffFormat: "simple" });
      expect(result).toContain("- old");
      expect(result).toContain("+ new");
    });

    it("shows unchanged attributes when showUnchangedAttributes=true", () => {
      const plan = JSON.stringify({
        format_version: "1.2",
        resource_changes: [
          {
            address: "null_resource.test",
            mode: "managed",
            type: "null_resource",
            name: "test",
            change: {
              actions: ["update"],
              before: { unchanged: "same", changed: "old" },
              after: { unchanged: "same", changed: "new" },
              before_sensitive: false,
              after_sensitive: false,
              after_unknown: false,
            },
          },
        ],
      });
      const withoutUnchanged = planToMarkdown(plan, { showUnchangedAttributes: false });
      const withUnchanged = planToMarkdown(plan, { showUnchangedAttributes: true });

      expect(withoutUnchanged).not.toContain('"same"');
      expect(withUnchanged).toContain("unchanged");
    });
  });

  describe("error handling", () => {
    it("throws on invalid JSON without exposing content", () => {
      expect(() => planToMarkdown("not valid json")).toThrowError(
        /Failed to parse plan JSON/,
      );
    });

    it("throws on format_version 2.x", () => {
      expect(() =>
        planToMarkdown(
          JSON.stringify({ format_version: "2.0", resource_changes: [] }),
        ),
      ).toThrowError(/format_version/);
    });
  });

  describe("outputs", () => {
    it("renders output changes", () => {
      const plan = JSON.stringify({
        format_version: "1.2",
        resource_changes: [],
        output_changes: {
          result: {
            actions: ["create"],
            before: null,
            after: "hello",
            before_sensitive: false,
            after_sensitive: false,
          },
        },
      });
      const result = planToMarkdown(plan);
      expect(result).toContain("result");
      expect(result).toContain("Outputs");
    });

    it("masks sensitive output values", () => {
      const plan = JSON.stringify({
        format_version: "1.2",
        resource_changes: [],
        output_changes: {
          secret_token: {
            actions: ["create"],
            before: null,
            after: "tok_s3cr3t",
            before_sensitive: false,
            after_sensitive: true,
          },
        },
      });
      const result = planToMarkdown(plan);
      expect(result).toContain("(sensitive)");
      expect(result).not.toContain("tok_s3cr3t");
    });
  });
});
