import { describe, it, expect } from "vitest";
import { suppressGoogleStorageManagedFolderMetaBoring } from "../../../../src/drift-filter/rules/google-storage-managed-folder.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_storage_managed_folder";

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

describe("suppressGoogleStorageManagedFolderMetaBoring", () => {
  it("returns true when only update_time changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        changed("update_time"),
      ]),
    ).toBe(true);
  });

  it("returns true when only metageneration changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        changed("metageneration"),
      ]),
    ).toBe(true);
  });

  it("returns true when both boring attributes changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        changed("metageneration"),
        changed("update_time"),
      ]),
    ).toBe(true);
  });

  it("returns true when boring attributes changed and other attributes are unchanged", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        changed("metageneration"),
        unchanged("name"),
        unchanged("bucket"),
      ]),
    ).toBe(true);
  });

  it("returns false when a non-boring attribute is also changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        changed("metageneration"),
        changed("force_destroy"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type with only boring attrs", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(
        "google_storage_bucket",
        "managed",
        [changed("metageneration")],
      ),
    ).toBe(false);
  });

  it("returns false when attributes is empty", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", []),
    ).toBe(false);
  });

  it("returns false when all attributes are unchanged", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        unchanged("metageneration"),
        unchanged("update_time"),
      ]),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "data", [
        changed("update_time"),
      ]),
    ).toBe(true);
  });
});
