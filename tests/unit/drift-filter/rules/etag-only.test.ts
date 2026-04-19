import { describe, it, expect } from "vitest";
import { suppressEtagOnlyDrift } from "../../../../src/drift-filter/rules/etag-only.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

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

describe("suppressEtagOnlyDrift", () => {
  it("returns true when the only changed attribute is etag", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [changed("etag")]),
    ).toBe(true);
  });

  it("returns true when etag changed and other attributes are unchanged", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [
        changed("etag"),
        unchanged("bucket"),
        unchanged("region"),
      ]),
    ).toBe(true);
  });

  it("returns false when etag is present alongside another changed attribute", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [
        changed("etag"),
        changed("last_modified"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(suppressEtagOnlyDrift("aws_s3_bucket", "managed", [])).toBe(false);
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [
        unchanged("etag"),
        unchanged("bucket"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not etag", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [
        changed("content_md5"),
      ]),
    ).toBe(false);
  });

  it("ignores type and mode", () => {
    expect(suppressEtagOnlyDrift("any_type", "data", [changed("etag")])).toBe(
      true,
    );
  });
});
