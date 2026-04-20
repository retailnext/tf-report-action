import { describe, it, expect, vi } from "vitest";
import {
  DriftRuleRegistry,
  createDefaultDriftRuleRegistry,
  type DriftRule,
} from "../../../src/drift-filter/registry.js";
import type { AttributeChange } from "../../../src/model/attribute.js";

function changed(name: string): AttributeChange {
  return {
    name,
    before: "old",
    after: "new",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

// Keep `attr` as an alias so existing tests don't need rewriting.
const attr = changed;

const NEVER: DriftRule = () => false;
const ALWAYS: DriftRule = () => true;

describe("DriftRuleRegistry", () => {
  it("empty registry never suppresses", () => {
    const registry = new DriftRuleRegistry();
    expect(registry.shouldSuppressDrift("any_resource", "managed", [])).toBe(
      false,
    );
  });

  it("returns false when all rules return false", () => {
    const registry = new DriftRuleRegistry().register(NEVER).register(NEVER);
    expect(
      registry.shouldSuppressDrift("any_resource", "managed", [attr("x")]),
    ).toBe(false);
  });

  it("returns true when any rule returns true", () => {
    const registry = new DriftRuleRegistry().register(NEVER).register(ALWAYS);
    expect(
      registry.shouldSuppressDrift("any_resource", "managed", [attr("x")]),
    ).toBe(true);
  });

  it("returns true when first rule matches and short-circuits", () => {
    const secondRule = vi.fn(NEVER);
    const registry = new DriftRuleRegistry()
      .register(ALWAYS)
      .register(secondRule);
    expect(registry.shouldSuppressDrift("any_resource", "managed", [])).toBe(
      true,
    );
    expect(secondRule).not.toHaveBeenCalled();
  });

  it("passes type, mode, and attributes to each rule", () => {
    const captured: Parameters<DriftRule>[] = [];
    const spy: DriftRule = (type, mode, attributes) => {
      captured.push([type, mode, attributes]);
      return false;
    };
    const registry = new DriftRuleRegistry().register(spy);
    const attrs = [attr("foo")];
    registry.shouldSuppressDrift("aws_instance", "managed", attrs);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(["aws_instance", "managed", attrs]);
  });

  it("register() returns this for chaining", () => {
    const registry = new DriftRuleRegistry();
    expect(registry.register(NEVER)).toBe(registry);
  });
});

describe("createDefaultDriftRuleRegistry", () => {
  it("returns a DriftRuleRegistry instance", () => {
    expect(createDefaultDriftRuleRegistry()).toBeInstanceOf(DriftRuleRegistry);
  });

  it("suppresses data source drift (mode=data)", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("aws_instance", "data", [attr("x")]),
    ).toBe(true);
  });

  it("suppresses etag-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("any_resource", "managed", [attr("etag")]),
    ).toBe(true);
  });

  it("suppresses google_storage_managed_folder boring-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("google_storage_managed_folder", "managed", [
        attr("metageneration"),
      ]),
    ).toBe(true);
  });

  it("suppresses google_compute_managed_ssl_certificate expire_time-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift(
        "google_compute_managed_ssl_certificate",
        "managed",
        [attr("expire_time")],
      ),
    ).toBe(true);
  });

  it("suppresses google_compute_url_map fingerprint-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("google_compute_url_map", "managed", [
        attr("fingerprint"),
      ]),
    ).toBe(true);
  });

  it("suppresses google_artifact_registry_repository update_time-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift(
        "google_artifact_registry_repository",
        "managed",
        [attr("update_time")],
      ),
    ).toBe(true);
  });

  it("suppresses google_storage_bucket updated-only drift", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("google_storage_bucket", "managed", [
        attr("updated"),
      ]),
    ).toBe(true);
  });

  it("does not suppress managed resource with non-boring changes", () => {
    const registry = createDefaultDriftRuleRegistry();
    expect(
      registry.shouldSuppressDrift("aws_instance", "managed", [
        attr("ami"),
        attr("instance_type"),
      ]),
    ).toBe(false);
  });

  it("suppresses etag-only drift when unchanged attrs are also present", () => {
    const registry = createDefaultDriftRuleRegistry();
    const unchangedAttr = {
      name: "bucket",
      before: "same",
      after: "same",
      isSensitive: false,
      isLarge: false,
      isKnownAfterApply: false,
    };
    expect(
      registry.shouldSuppressDrift("aws_s3_bucket", "managed", [
        attr("etag"),
        unchangedAttr,
      ]),
    ).toBe(true);
  });
});
