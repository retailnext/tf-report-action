import { describe, it, expect } from "vitest";
import { suppressGoogleArtifactRegistryRepositoryUpdateTime } from "../../../../src/drift-filter/rules/google-artifact-registry-repository.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_artifact_registry_repository";

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

describe("suppressGoogleArtifactRegistryRepositoryUpdateTime", () => {
  it("returns true when the only changed attribute is update_time", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", [
        changed("update_time"),
      ]),
    ).toBe(true);
  });

  it("returns true when update_time changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", [
        changed("update_time"),
        unchanged("name"),
        unchanged("format"),
      ]),
    ).toBe(true);
  });

  it("returns false when update_time is present alongside another changed attribute", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", [
        changed("update_time"),
        changed("description"),
      ]),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", []),
    ).toBe(false);
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", [
        unchanged("update_time"),
        unchanged("name"),
      ]),
    ).toBe(false);
  });

  it("returns false when the only changed attribute is not update_time", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "managed", [
        changed("description"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(
        "google_artifact_registry_repository_iam_member",
        "managed",
        [changed("update_time")],
      ),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleArtifactRegistryRepositoryUpdateTime(TYPE, "data", [
        changed("update_time"),
      ]),
    ).toBe(true);
  });
});
