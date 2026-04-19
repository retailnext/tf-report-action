import type { DriftRule } from "../registry.js";
import type { AttributeChange } from "../../model/attribute.js";

const BORING_ATTRIBUTES = new Set(["metageneration", "update_time"]);

/**
 * Suppresses drift for `google_storage_managed_folder` resources where the only
 * changed attributes are `metageneration` and/or `update_time`.
 *
 * These attributes are updated automatically by Google Cloud Storage on every
 * metadata operation and do not indicate meaningful infrastructure drift.
 */
export const suppressGoogleStorageManagedFolderMetaBoring: DriftRule = (
  type: string,
  _mode: string,
  attributes: AttributeChange[],
): boolean =>
  type === "google_storage_managed_folder" &&
  attributes.length > 0 &&
  attributes.every((a) => BORING_ATTRIBUTES.has(a.name));
