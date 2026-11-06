import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for `google_cloud_run_v2_job` resources where the only
 * changed attributes are `execution_count` and/or attributes of
 * `latest_created_execution`.
 *
 * Cloud Run updates these attributes on every execution of the job, including
 * executions that Cloud Scheduler or another caller starts outside of
 * Terraform — they do not indicate a configuration divergence that requires
 * human attention.
 */
export const suppressGoogleCloudRunV2JobExecution: DriftRule = (
  type: string,
  _mode: string,
  attributes,
): boolean => {
  if (type !== "google_cloud_run_v2_job") return false;
  const changed = attributes.filter((a) => a.before !== a.after);
  return (
    changed.length > 0 && changed.every((a) => isExecutionAttribute(a.name))
  );
};

function isExecutionAttribute(name: string): boolean {
  return (
    name === "execution_count" ||
    name === "latest_created_execution" ||
    name.startsWith("latest_created_execution[")
  );
}
