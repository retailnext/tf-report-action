import { describe, it, expect } from "vitest";
import { suppressGoogleStorageManagedFolderMetaBoring } from "../../../../src/drift-filter/rules/google-storage-managed-folder.js";
import type { AttributeChange } from "../../../../src/model/attribute.js";

const TYPE = "google_storage_managed_folder";

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

describe("suppressGoogleStorageManagedFolderMetaBoring", () => {
  it("returns true when only update_time changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        attr("update_time"),
      ]),
    ).toBe(true);
  });

  it("returns true when only metageneration changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        attr("metageneration"),
      ]),
    ).toBe(true);
  });

  it("returns true when both boring attributes changed", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        attr("metageneration"),
        attr("update_time"),
      ]),
    ).toBe(true);
  });

  it("returns false when a non-boring attribute is also present", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", [
        attr("metageneration"),
        attr("force_destroy"),
      ]),
    ).toBe(false);
  });

  it("returns false for a different resource type with only boring attrs", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(
        "google_storage_bucket",
        "managed",
        [attr("metageneration")],
      ),
    ).toBe(false);
  });

  it("returns false when attributes is empty (no visible change to suppress)", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "managed", []),
    ).toBe(false);
  });

  it("ignores mode", () => {
    expect(
      suppressGoogleStorageManagedFolderMetaBoring(TYPE, "data", [
        attr("update_time"),
      ]),
    ).toBe(true);
  });
});
