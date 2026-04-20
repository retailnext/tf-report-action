import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for `google_compute_url_map` resources where the only changed
 * attribute is `fingerprint`.
 *
 * `fingerprint` is a server-generated hash that Google Cloud updates after every
 * configuration write — it does not indicate a configuration divergence that
 * requires human attention.
 */
export const suppressGoogleComputeUrlMapFingerprint: DriftRule = (
  type: string,
  _mode: string,
  attributes,
): boolean => {
  if (type !== "google_compute_url_map") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "fingerprint");
};
