import { describe, it, expect } from "vitest";
import { suppressGoogleStorageBucketUpdated } from "../../../../src/drift-filter/rules/google-storage-bucket.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_storage_bucket";

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

describe("suppressGoogleStorageBucketUpdated", () => {
  it("returns true when the only changed attribute is updated", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "managed", [changed("updated")]),
    ).toBe(true);
  });

  it("returns true when updated changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "managed", [
        changed("updated"),
        unchanged("name"),
        unchanged("location"),
      ]),
    ).toBe(true);
  });

  it("returns false when updated is present alongside another changed attribute", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "managed", [
        changed("updated"),
        changed("storage_class"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(suppressGoogleStorageBucketUpdated(TYPE, "managed", [])).toBe(false);
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "managed", [
        unchanged("updated"),
        unchanged("name"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not updated", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "managed", [
        changed("storage_class"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type", () => {
    expect(
      suppressGoogleStorageBucketUpdated(
        "google_storage_bucket_object",
        "managed",
        [changed("updated")],
      ),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleStorageBucketUpdated(TYPE, "data", [changed("updated")]),
    ).toBe(true);
  });
});
