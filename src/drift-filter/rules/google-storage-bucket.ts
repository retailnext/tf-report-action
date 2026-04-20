import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for `google_storage_bucket` resources where the only changed
 * attribute is `updated`.
 *
 * `updated` is a server-managed timestamp that Google Cloud Storage sets on every
 * metadata write — it does not indicate a configuration divergence that requires
 * human attention.
 */
export const suppressGoogleStorageBucketUpdated: DriftRule = (
  type: string,
  _mode: string,
  attributes,
): boolean => {
  if (type !== "google_storage_bucket") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "updated");
};
