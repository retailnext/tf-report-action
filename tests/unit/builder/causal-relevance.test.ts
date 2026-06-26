import { describe, it, expect } from "vitest";
import {
  configForm,
  buildConcernSeed,
  filterJsonlByConcernRelevance,
} from "../../../src/builder/causal-relevance.js";

// ─── configForm ──────────────────────────────────────────────────────────────

describe("configForm", () => {
  it("strips a string instance key", () => {
    expect(
      configForm(
        'module.read-outputs.data.google_storage_bucket_object_content.this["org-admin"]',
      ),
    ).toBe(
      "module.read-outputs.data.google_storage_bucket_object_content.this",
    );
  });

  it("strips a numeric instance key", () => {
    expect(configForm("aws_instance.web[0]")).toBe("aws_instance.web");
  });

  it("strips instance keys on intermediate module segments", () => {
    expect(configForm('module.foo["a"].aws_s3_bucket.logs[2]')).toBe(
      "module.foo.aws_s3_bucket.logs",
    );
  });

  it("leaves an address with no instance key unchanged", () => {
    expect(configForm("module.foo.aws_instance.web")).toBe(
      "module.foo.aws_instance.web",
    );
  });
});

// ─── buildConcernSeed ────────────────────────────────────────────────────────

describe("buildConcernSeed", () => {
  it("seeds an address from an error diagnostic with an address", () => {
    const content = JSON.stringify({
      type: "diagnostic",
      diagnostic: {
        severity: "error",
        summary: "boom",
        address: "module.foo.aws_instance.web[0]",
      },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.has("module.foo.aws_instance.web")).toBe(true);
  });

  it("seeds an address from a WARNING diagnostic just like an error", () => {
    const content = JSON.stringify({
      type: "diagnostic",
      diagnostic: {
        severity: "warning",
        summary: "deprecated",
        address: "aws_s3_bucket.logs",
      },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.has("aws_s3_bucket.logs")).toBe(true);
  });

  it("registers a concern for an addressless error diagnostic (no seed address)", () => {
    const content = JSON.stringify({
      type: "diagnostic",
      diagnostic: {
        severity: "error",
        summary: "Invalid index",
        range: {
          filename: "modules/firewall/x.tf",
          start: { line: 33, column: 44, byte: 832 },
          end: { line: 33, column: 72, byte: 860 },
        },
      },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.size).toBe(0);
  });

  it("seeds an address from an errored hook", () => {
    const content = JSON.stringify({
      type: "apply_errored",
      hook: { resource: { addr: "aws_instance.web" } },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.has("aws_instance.web")).toBe(true);
  });

  it("seeds an address from a provision_errored hook", () => {
    const content = JSON.stringify({
      type: "provision_errored",
      hook: { resource: { addr: "aws_instance.web" } },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.has("aws_instance.web")).toBe(true);
  });

  it("does NOT treat an unknown-severity diagnostic as a concern", () => {
    const content = JSON.stringify({
      type: "diagnostic",
      diagnostic: {
        severity: "unknown",
        summary: "huh",
        address: "aws_instance.web",
      },
    });
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(false);
    expect(seed.seedAddrs.size).toBe(0);
  });

  it("reports no concern for refresh hooks and structural lines", () => {
    const content = [
      JSON.stringify({ type: "version", tofu: "1.11.6" }),
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "aws_instance.web" } },
      }),
      JSON.stringify({ type: "change_summary", changes: { add: 0 } }),
    ].join("\n");
    const seed = buildConcernSeed(content);
    expect(seed.hasConcern).toBe(false);
  });
});

// ─── filterJsonlByConcernRelevance ───────────────────────────────────────────

describe("filterJsonlByConcernRelevance", () => {
  it("drops all unrelated refresh hooks and structural lines, keeping the addressless error", () => {
    // Reproduces the Invalid index report: an addressless config error after
    // many successful refreshes of unrelated resources.
    const refreshes = Array.from({ length: 50 }, (_v, i) =>
      JSON.stringify({
        type: "refresh_complete",
        hook: {
          resource: {
            addr: `module.read-outputs.data.x.this["k${String(i)}"]`,
          },
        },
      }),
    );
    const content = [
      JSON.stringify({ type: "version", tofu: "1.11.6" }),
      ...refreshes,
      JSON.stringify({ type: "change_summary", changes: { add: 0 } }),
      JSON.stringify({ type: "outputs", outputs: {} }),
      JSON.stringify({
        type: "diagnostic",
        diagnostic: {
          severity: "error",
          summary: "Invalid index",
          range: {
            filename: "modules/firewall/x.tf",
            start: { line: 33, column: 44, byte: 832 },
            end: { line: 33, column: 72, byte: 860 },
          },
        },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);

    expect(result).toContain("Invalid index");
    expect(result).not.toContain("refresh_complete");
    expect(result).not.toContain('"version"');
    expect(result).not.toContain("change_summary");
    expect(result).not.toContain('"outputs"');
  });

  it("keeps hooks for a resource a WARNING is about, dropping siblings", () => {
    const content = [
      JSON.stringify({
        type: "diagnostic",
        diagnostic: {
          severity: "warning",
          summary: "deprecated arg",
          address: "aws_instance.web",
        },
      }),
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "aws_instance.web" } },
      }),
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "aws_instance.sibling" } },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result).toContain("deprecated arg");
    expect(result).toContain("aws_instance.web");
    expect(result).not.toContain("aws_instance.sibling");
  });

  it("keeps the errored resource's start/complete hooks via the seed", () => {
    const content = [
      JSON.stringify({
        type: "apply_start",
        hook: { resource: { addr: "aws_db_instance.main" } },
      }),
      JSON.stringify({
        type: "apply_errored",
        hook: { resource: { addr: "aws_db_instance.main" } },
      }),
      JSON.stringify({
        type: "apply_complete",
        hook: { resource: { addr: "aws_instance.unrelated" } },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result).toContain("apply_start");
    expect(result).toContain("apply_errored");
    expect(result).toContain("aws_db_instance.main");
    expect(result).not.toContain("aws_instance.unrelated");
  });

  it("drops an unrelated unknown-severity diagnostic with no address or range match", () => {
    const content = [
      JSON.stringify({
        type: "diagnostic",
        diagnostic: {
          severity: "error",
          summary: "the real error",
          address: "aws_instance.web",
        },
      }),
      JSON.stringify({
        type: "diagnostic",
        diagnostic: {
          severity: "unknown",
          summary: "noise unknown",
          address: "aws_instance.elsewhere",
        },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result).toContain("the real error");
    expect(result).not.toContain("noise unknown");
  });

  it("retains non-JSON and unclassifiable lines (fail-safe)", () => {
    const content = [
      "not json at all",
      JSON.stringify({ no_type_field: true }),
      JSON.stringify({
        type: "diagnostic",
        diagnostic: { severity: "error", summary: "boom", address: "x.y" },
      }),
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "unrelated.thing" } },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result).toContain("not json at all");
    expect(result).toContain("no_type_field");
    expect(result).toContain("boom");
    expect(result).not.toContain("unrelated.thing");
  });

  it("does not filter when there is no concern (keeps everything)", () => {
    const content = [
      JSON.stringify({ type: "version", tofu: "1.11.6" }),
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "aws_instance.web" } },
      }),
      JSON.stringify({ type: "change_summary", changes: { add: 0 } }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result).toBe(content);
  });

  it("preserves blank lines", () => {
    const content = [
      JSON.stringify({
        type: "diagnostic",
        diagnostic: { severity: "error", summary: "boom", address: "x.y" },
      }),
      "",
      JSON.stringify({
        type: "refresh_complete",
        hook: { resource: { addr: "x.y" } },
      }),
    ].join("\n");

    const result = filterJsonlByConcernRelevance(content);
    expect(result.split("\n")).toContain("");
  });
});
