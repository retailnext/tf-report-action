import { describe, it, expect } from "vitest";
import { scanString } from "../../../src/jsonl-scanner/scan.js";
import {
  configForm,
  ConcernSeedCollector,
  RelevanceEmitter,
} from "../../../src/builder/causal-relevance.js";

/** Build a JSONL string from objects. */
function jsonl(...objects: Record<string, unknown>[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n");
}

function diagnostic(
  severity: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "diagnostic",
    diagnostic: { severity, summary: "boom", detail: "", ...extra },
  };
}

function refresh(addr: string): Record<string, unknown> {
  return { type: "refresh_start", hook: { resource: { addr } } };
}

function applyErrored(addr: string): Record<string, unknown> {
  return {
    type: "apply_errored",
    hook: { resource: { addr }, action: "create" },
  };
}

/** Collect the seed by feeding content through the scanner's visitor. */
function seedOf(content: string) {
  const collector = new ConcernSeedCollector();
  scanString(content, collector.visit);
  return collector.seed;
}

/** Emit the relevant lines by feeding content through the scanner's visitor. */
function emit(content: string, seed = seedOf(content)): string {
  const emitter = new RelevanceEmitter(seed);
  scanString(content, emitter.visit);
  return emitter.output();
}

describe("configForm", () => {
  it("strips instance keys from every segment", () => {
    expect(configForm('module.m["a"].aws_instance.web[0]')).toBe(
      "module.m.aws_instance.web",
    );
    expect(configForm("aws_instance.web")).toBe("aws_instance.web");
  });
});

describe("ConcernSeedCollector", () => {
  it("seeds addresses from error and warning diagnostics alike", () => {
    const seed = seedOf(
      jsonl(
        diagnostic("error", { address: "aws_instance.bad" }),
        diagnostic("warning", { address: "aws_instance.warned" }),
      ),
    );
    expect(seed.hasConcern).toBe(true);
    expect([...seed.seedAddrs].sort()).toEqual([
      "aws_instance.bad",
      "aws_instance.warned",
    ]);
  });

  it("sets hasConcern but no address for an addressless concern", () => {
    const seed = seedOf(jsonl(diagnostic("error")));
    expect(seed.hasConcern).toBe(true);
    expect(seed.seedAddrs.size).toBe(0);
  });

  it("ignores diagnostics that are neither error nor warning", () => {
    const seed = seedOf(jsonl(diagnostic("unknown", { address: "a.b" })));
    expect(seed.hasConcern).toBe(false);
    expect(seed.seedAddrs.size).toBe(0);
  });

  it("seeds the address of an errored hook", () => {
    const seed = seedOf(jsonl(applyErrored("aws_db_instance.main")));
    expect(seed.hasConcern).toBe(true);
    expect([...seed.seedAddrs]).toEqual(["aws_db_instance.main"]);
  });

  it("strips instance keys when seeding", () => {
    const seed = seedOf(
      jsonl(diagnostic("error", { address: 'aws_instance.web["a"]' })),
    );
    expect([...seed.seedAddrs]).toEqual(["aws_instance.web"]);
  });

  it("reports no concern for hooks-only content", () => {
    const seed = seedOf(jsonl(refresh("a.b"), refresh("c.d")));
    expect(seed.hasConcern).toBe(false);
  });
});

describe("RelevanceEmitter", () => {
  it("drops unrelated refresh hooks but keeps the addressless error", () => {
    const content = jsonl(
      { type: "version", tofu: "1.8.0" },
      refresh("null_resource.a"),
      refresh("null_resource.b"),
      { type: "change_summary", changes: { add: 0 } },
      diagnostic("error", { summary: "Invalid index" }),
    );
    const out = emit(content);
    expect(out).toContain("Invalid index");
    expect(out).not.toContain("refresh_start");
    expect(out).not.toContain("version");
    expect(out).not.toContain("change_summary");
  });

  it("keeps hooks for a resource a warning is about, drops siblings", () => {
    const content = jsonl(
      refresh("aws_instance.warned"),
      refresh("aws_instance.other"),
      diagnostic("warning", { address: "aws_instance.warned" }),
    );
    const out = emit(content);
    expect(out).toContain("aws_instance.warned");
    expect(out).not.toContain("aws_instance.other");
  });

  it("keeps hooks for a resource an errored hook is about", () => {
    const content = jsonl(
      refresh("aws_db_instance.main"),
      refresh("aws_s3_bucket.unrelated"),
      applyErrored("aws_db_instance.main"),
    );
    const out = emit(content);
    expect(out).toContain("aws_db_instance.main");
    expect(out).not.toContain("aws_s3_bucket.unrelated");
  });

  it("matches a hook to a seed address regardless of instance key", () => {
    const content = jsonl(
      refresh('aws_instance.web["a"]'),
      diagnostic("error", { address: "aws_instance.web" }),
    );
    const out = emit(content);
    expect(out).toContain("refresh_start");
    expect(out.split("\n")).toHaveLength(2);
  });

  it("drops an unknown-severity diagnostic that matches no concern", () => {
    const content = jsonl(
      diagnostic("error", { address: "aws_instance.bad" }),
      diagnostic("unknown", { summary: "informational note" }),
    );
    const out = emit(content);
    expect(out).not.toContain("informational note");
  });

  it("keeps an unknown-severity diagnostic about a seeded resource", () => {
    const content = jsonl(
      diagnostic("error", { address: "aws_instance.bad" }),
      diagnostic("unknown", {
        address: "aws_instance.bad",
        summary: "related note",
      }),
    );
    const out = emit(content);
    expect(out).toContain("related note");
  });

  it("retains non-JSON / unclassifiable lines (fail-safe)", () => {
    const content = [
      "not json at all",
      JSON.stringify(diagnostic("error", { summary: "real error" })),
      JSON.stringify([1, 2, 3]),
    ].join("\n");
    const out = emit(content);
    expect(out).toContain("not json at all");
    expect(out).toContain("real error");
    expect(out).toContain("[1,2,3]");
  });
});
