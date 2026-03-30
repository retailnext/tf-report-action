/**
 * Twirp RPC calls to the Actions Results Service.
 *
 * The Actions Results Service uses the Twirp protocol for artifact lifecycle
 * management (create, finalize). Each call is a POST with a JSON body to a
 * well-known URL pattern, authenticated with the `ACTIONS_RUNTIME_TOKEN`.
 *
 * Both calls are wrapped in `withRetry` to handle transient HTTP errors
 * (429, 5xx) with exponential backoff.
 */

import { ActionsError, assertOk, withRetry } from "../http/index.js";
import type { ArtifactTransport, BackendIds } from "./types.js";

const SERVICE = "github.actions.results.api.v1.ArtifactService";

/** Status codes that trigger a retry. */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
]);

/** Dependencies for Twirp RPC calls. */
export interface TwirpDeps {
  /** Actions results service URL (origin extracted from this). */
  readonly resultsUrl: string;
  /** Bearer token for Authorization header. */
  readonly runtimeToken: string;
  /** HTTP transport — injected for proxy support and testability. */
  readonly transport: ArtifactTransport;
  /** Sleep implementation for retry backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Response from CreateArtifact RPC. */
export interface CreateArtifactResponse {
  readonly signedUploadUrl: string;
}

/** Response from FinalizeArtifact RPC. */
export interface FinalizeArtifactResponse {
  readonly artifactId: number;
}

/**
 * Create an artifact record and obtain a signed blob upload URL.
 *
 * Sends a CreateArtifact Twirp call with protocol version 7. The returned
 * `signedUploadUrl` is a time-limited Azure Blob Storage SAS URL.
 */
export async function createArtifact(
  deps: TwirpDeps,
  params: {
    readonly name: string;
    readonly backendIds: BackendIds;
    readonly mimeType?: string;
  },
): Promise<CreateArtifactResponse> {
  const body: Record<string, unknown> = {
    workflowRunBackendId: params.backendIds.workflowRunBackendId,
    workflowJobRunBackendId: params.backendIds.workflowJobRunBackendId,
    name: params.name,
    version: 7,
    ...(params.mimeType !== undefined && { mime_type: params.mimeType }),
  };

  const parsed = await twirpCall(deps, "CreateArtifact", body);
  const url = (parsed as Record<string, unknown>)["signedUploadUrl"];
  if (typeof url !== "string" || url === "") {
    throw new ActionsError("CreateArtifact response missing signedUploadUrl");
  }

  return { signedUploadUrl: url };
}

/**
 * Finalize an artifact after blob upload, confirming size and hash.
 *
 * The `size` is sent as a string (int64 JSON encoding) and the hash value
 * uses the `sha256:` prefix format.
 */
export async function finalizeArtifact(
  deps: TwirpDeps,
  params: {
    readonly name: string;
    readonly backendIds: BackendIds;
    readonly size: number;
    readonly sha256Hex: string;
  },
): Promise<FinalizeArtifactResponse> {
  const body = {
    workflowRunBackendId: params.backendIds.workflowRunBackendId,
    workflowJobRunBackendId: params.backendIds.workflowJobRunBackendId,
    name: params.name,
    size: String(params.size),
    hash: { value: `sha256:${params.sha256Hex}` },
  };

  const parsed = await twirpCall(deps, "FinalizeArtifact", body);
  const rawId = (parsed as Record<string, unknown>)["artifactId"];

  // artifactId comes as a string (int64 encoding) or number
  const id =
    typeof rawId === "string"
      ? Number(rawId)
      : typeof rawId === "number"
        ? rawId
        : NaN;
  if (!Number.isFinite(id)) {
    throw new ActionsError(
      "FinalizeArtifact response missing or invalid artifactId",
    );
  }

  return { artifactId: id };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Whether an error from assertOk should trigger a retry. */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof ActionsError &&
    error.statusCode !== undefined &&
    RETRYABLE_STATUS_CODES.has(error.statusCode)
  );
}

/**
 * Make a Twirp RPC call with retry.
 *
 * Constructs the URL from the results origin + service + method, sends a
 * JSON POST with the runtime token, and parses the JSON response.
 */
async function twirpCall(
  deps: TwirpDeps,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const origin = new URL(deps.resultsUrl).origin;
  const url = `${origin}/twirp/${SERVICE}/${method}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${deps.runtimeToken}`,
    "User-Agent": "tf-report-action",
  };

  const jsonBody = JSON.stringify(body);

  const response = await withRetry(
    async () => {
      const res = await deps.transport("POST", url, headers, jsonBody);
      assertOk(res.status, res.body, method);
      return res;
    },
    isRetryable,
    deps.sleep !== undefined ? { sleep: deps.sleep } : undefined,
  );

  try {
    return JSON.parse(response.body) as unknown;
  } catch {
    throw new ActionsError(`${method}: response body is not valid JSON`);
  }
}
