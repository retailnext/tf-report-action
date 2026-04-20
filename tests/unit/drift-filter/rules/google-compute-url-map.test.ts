import { describe, it, expect } from "vitest";
import { suppressGoogleComputeUrlMapFingerprint } from "../../../../src/drift-filter/rules/google-compute-url-map.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_compute_url_map";

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

function unchanged(name: string): AttributeChange {
  return {
    name,
    before: "same",
    after: "same",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

describe("suppressGoogleComputeUrlMapFingerprint", () => {
  it("returns true when the only changed attribute is fingerprint", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [
        changed("fingerprint"),
      ]),
    ).toBe(true);
  });

  it("returns true when fingerprint changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [
        changed("fingerprint"),
        unchanged("name"),
        unchanged("default_service"),
      ]),
    ).toBe(true);
  });

  it("returns false when fingerprint is present alongside another changed attribute", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [
        changed("fingerprint"),
        changed("default_service"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [])).toBe(
      false,
    );
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [
        unchanged("fingerprint"),
        unchanged("name"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not fingerprint", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "managed", [
        changed("default_service"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(
        "google_compute_backend_service",
        "managed",
        [changed("fingerprint")],
      ),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleComputeUrlMapFingerprint(TYPE, "data", [
        changed("fingerprint"),
      ]),
    ).toBe(true);
  });
});
