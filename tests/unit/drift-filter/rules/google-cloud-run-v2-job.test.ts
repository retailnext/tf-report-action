import { describe, it, expect } from "vitest";
import { suppressGoogleCloudRunV2JobExecution } from "../../../../src/drift-filter/rules/google-cloud-run-v2-job.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_cloud_run_v2_job";

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

describe("suppressGoogleCloudRunV2JobExecution", () => {
  it("returns true when the only changed attribute is execution_count", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("execution_count"),
      ]),
    ).toBe(true);
  });

  it("returns true when execution_count and latest_created_execution attributes changed", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("execution_count"),
        changed("latest_created_execution[0].completion_time"),
        changed("latest_created_execution[0].create_time"),
        changed("latest_created_execution[0].name"),
      ]),
    ).toBe(true);
  });

  it("returns true when execution attributes changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("execution_count"),
        changed("latest_created_execution[0].name"),
        unchanged("name"),
        unchanged("location"),
        unchanged("template[0].template[0].containers[0].image"),
      ]),
    ).toBe(true);
  });

  it("returns true when latest_created_execution appears without an index", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("latest_created_execution"),
      ]),
    ).toBe(true);
  });

  it("returns false when execution attributes are present alongside another changed attribute", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("execution_count"),
        changed("latest_created_execution[0].name"),
        changed("template[0].template[0].containers[0].image"),
      ]),
    ).toBe(false);
  });

  it("returns false for an attribute that only shares the latest_created_execution prefix", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("latest_created_execution_extra"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [])).toBe(
      false,
    );
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        unchanged("execution_count"),
        unchanged("latest_created_execution[0].name"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not an execution attribute", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "managed", [
        changed("update_time"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(
        "google_cloud_run_v2_service",
        "managed",
        [changed("execution_count")],
      ),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleCloudRunV2JobExecution(TYPE, "data", [
        changed("execution_count"),
      ]),
    ).toBe(true);
  });
});
