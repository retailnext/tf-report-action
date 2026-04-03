/**
 * Decode the Actions runtime JWT to extract backend IDs.
 *
 * The `ACTIONS_RUNTIME_TOKEN` is a JWT whose `scp` claim contains a
 * space-separated list of scopes. One scope has the format
 * `Actions.Results:<workflowRunBackendId>:<workflowJobRunBackendId>`.
 * This module extracts those two IDs without verifying the JWT signature
 * (signature verification is unnecessary — the token is consumed by the
 * same process that received it from the runner).
 */

import type { BackendIds } from "./types.js";

/**
 * Extract workflow run and job backend IDs from an Actions runtime JWT.
 *
 * @throws {Error} If the token is malformed, the payload cannot be decoded,
 *   or the `scp` claim does not contain an `Actions.Results` scope with
 *   exactly two backend IDs.
 */
export function extractBackendIds(runtimeToken: string): BackendIds {
  const segments = runtimeToken.split(".");
  if (segments.length < 3) {
    throw new Error(
      `Expected a JWT with 3 segments, got ${String(segments.length)}`,
    );
  }

  const payloadSegment = segments[1];
  if (payloadSegment === undefined) {
    throw new Error("JWT payload segment is missing");
  }

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadSegment, "base64url").toString("utf-8");
  } catch {
    throw new Error("Failed to base64url-decode the JWT payload segment");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error("JWT payload is not valid JSON");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("JWT payload is not an object");
  }

  const scp = (payload as Record<string, unknown>)["scp"];
  if (typeof scp !== "string") {
    throw new Error(`Expected "scp" claim to be a string, got ${typeof scp}`);
  }

  const scopes = scp.split(" ");
  const resultsScope = scopes.find((s) => s.startsWith("Actions.Results:"));
  if (resultsScope === undefined) {
    throw new Error('No "Actions.Results:" scope found in the "scp" claim');
  }

  const parts = resultsScope.split(":");
  if (parts.length !== 3) {
    throw new Error(
      `Expected "Actions.Results:<runId>:<jobId>", got ${String(parts.length)} parts`,
    );
  }

  const workflowRunBackendId = parts[1];
  const workflowJobRunBackendId = parts[2];

  if (
    workflowRunBackendId === undefined ||
    workflowJobRunBackendId === undefined ||
    workflowRunBackendId === "" ||
    workflowJobRunBackendId === ""
  ) {
    throw new Error("Backend IDs in Actions.Results scope must not be empty");
  }

  return { workflowRunBackendId, workflowJobRunBackendId };
}
