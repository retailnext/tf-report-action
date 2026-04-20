import { describe, it, expect } from "vitest";
import { suppressDataSourceDrift } from "../../../../src/drift-filter/rules/data-source.js";

describe("suppressDataSourceDrift", () => {
  it("returns true for mode=data", () => {
    expect(suppressDataSourceDrift("aws_s3_bucket", "data", [])).toBe(true);
  });

  it("returns true for mode=data regardless of type", () => {
    expect(suppressDataSourceDrift("null_data_source", "data", [])).toBe(true);
  });

  it("returns false for mode=managed", () => {
    expect(suppressDataSourceDrift("aws_s3_bucket", "managed", [])).toBe(false);
  });

  it("returns false for mode=ephemeral", () => {
    expect(suppressDataSourceDrift("aws_s3_bucket", "ephemeral", [])).toBe(
      false,
    );
  });

  it("ignores attributes entirely", () => {
    const attrs = [
      {
        name: "id",
        before: "old",
        after: "new",
        isSensitive: false,
        isLarge: false,
        isKnownAfterApply: false,
      },
    ];
    expect(suppressDataSourceDrift("aws_s3_bucket", "data", attrs)).toBe(true);
    expect(suppressDataSourceDrift("aws_s3_bucket", "managed", attrs)).toBe(
      false,
    );
  });
});
