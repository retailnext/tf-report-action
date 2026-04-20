import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for `google_artifact_registry_repository` resources where the
 * only changed attribute is `update_time`.
 *
 * `update_time` is a server-managed timestamp that Google Cloud updates on every
 * metadata operation — it does not indicate a configuration divergence that
 * requires human attention.
 */
export const suppressGoogleArtifactRegistryRepositoryUpdateTime: DriftRule = (
  type: string,
  _mode: string,
  attributes,
): boolean => {
  if (type !== "google_artifact_registry_repository") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return changed.length > 0 && changed.every((a) => a.name === "update_time");
};
