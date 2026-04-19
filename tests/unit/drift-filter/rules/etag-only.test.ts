import { describe, it, expect } from "vitest";
import { suppressEtagOnlyDrift } from "../../../../src/drift-filter/rules/etag-only.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

function attr(name: string): AttributeChange {
  return {
    name,
    before: "old",
    after: "new",
    isSensitive: false,
    isLarge: false,
    isKnownAfterApply: false,
  };
}

describe("suppressEtagOnlyDrift", () => {
  it("returns true when the only attribute is etag", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [attr("etag")]),
    ).toBe(true);
  });

  it("returns false when etag is present alongside another attribute", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [
        attr("etag"),
        attr("last_modified"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(suppressEtagOnlyDrift("aws_s3_bucket", "managed", [])).toBe(false);
  });

  it("returns false when the only attribute is not etag", () => {
    expect(
      suppressEtagOnlyDrift("aws_s3_bucket", "managed", [attr("content_md5")]),
    ).toBe(false);
  });

  it("ignores type and mode", () => {
    expect(suppressEtagOnlyDrift("any_type", "data", [attr("etag")])).toBe(
      true,
    );
  });
});
