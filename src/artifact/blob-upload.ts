/**
 * Single-PUT blob upload to Azure Blob Storage.
 *
 * After `createArtifact` returns a signed upload URL, this module sends
 * the artifact content as a single `PUT` request (Strategy A — for files
 * ≤128 MiB, which is always the case for report HTML artifacts).
 *
 * The upload is retried on transient HTTP errors (5xx) with the same
 * exponential backoff used by the Twirp calls.
 */

import { ActionsError } from "../http/errors.js";
import { withRetry } from "../http/retry.js";
import { assertOk } from "../http/transport.js";
import type { ArtifactTransport } from "./types.js";

/** Status codes that trigger a retry on blob upload. */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
]);

/** Dependencies for blob upload. */
export interface BlobUploadDeps {
  /** Azure Blob Storage signed URL from CreateArtifact. */
  readonly signedUrl: string;
  /** UTF-8 string content to upload. */
  readonly content: string;
  /** MIME type for the Content-Type header. */
  readonly contentType: string;
  /** HTTP transport — injected for proxy support and testability. */
  readonly transport: ArtifactTransport;
  /** Sleep implementation for retry backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Upload content to Azure Blob Storage via a signed URL.
 *
 * Sends a single PUT with `x-ms-blob-type: BlockBlob`, the appropriate
 * Content-Type, and Content-Length derived from the UTF-8 byte length
 * of the content string.
 */
export async function uploadBlob(deps: BlobUploadDeps): Promise<void> {
  const byteLength = Buffer.byteLength(deps.content, "utf-8");

  const headers: Record<string, string> = {
    "x-ms-blob-type": "BlockBlob",
    "Content-Type": deps.contentType,
    "Content-Length": String(byteLength),
  };

  await withRetry(
    async () => {
      const res = await deps.transport(
        "PUT",
        deps.signedUrl,
        headers,
        deps.content,
      );
      assertOk(res.status, res.body, "BlobUpload");
    },
    isRetryable,
    deps.sleep !== undefined ? { sleep: deps.sleep } : undefined,
  );
}

/** Whether an error from assertOk should trigger a retry. */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof ActionsError &&
    error.statusCode !== undefined &&
    RETRYABLE_STATUS_CODES.has(error.statusCode)
  );
}
