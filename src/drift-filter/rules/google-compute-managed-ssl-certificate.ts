import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for `google_compute_managed_ssl_certificate` resources where
 * the only changed attribute is `expire_time`.
 *
 * `expire_time` is updated automatically by Google Cloud as certificates approach
 * expiry and are renewed — it does not indicate a configuration divergence that
 * requires human attention.
 */
export const suppressGoogleComputeManagedSslCertificateExpireTime: DriftRule = (
  type: string,
  _mode: string,
  attributes,
): boolean => {
  if (type !== "google_compute_managed_ssl_certificate") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "expire_time");
};
