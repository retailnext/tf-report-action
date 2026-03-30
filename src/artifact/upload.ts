/**
 * Artifact upload orchestrator.
 *
 * Wires the JWT decoder, Twirp RPC calls, and blob upload into a single
 * `upload()` method. The caller provides a display name and filename; the
 * orchestrator handles GHES validation, hashing, and the three-step upload
 * protocol (create → blob PUT → finalize).
 */

import { createHash as nodeCreateHash } from "node:crypto";
import { ActionsError } from "../http/index.js";
import { extractBackendIds } from "./jwt.js";
import { createArtifact, finalizeArtifact } from "./twirp.js";
import { uploadBlob } from "./blob-upload.js";
import type { ArtifactUploaderDeps, UploadArtifactResult } from "./types.js";

/** Hostnames allowed for artifact upload (GHES guard). */
const ALLOWED_HOSTNAME = "github.com";
const ALLOWED_SUFFIX = ".ghe.com";

/** Map file extension → MIME type for the blob upload Content-Type header. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html",
  ".md": "text/markdown",
};
const DEFAULT_MIME = "application/octet-stream";

/**
 * Create an artifact uploader bound to the given dependencies.
 *
 * The returned `upload()` method handles the full artifact lifecycle:
 * GHES guard → JWT decode → SHA-256 hash → CreateArtifact → blob upload →
 * FinalizeArtifact. The caller is responsible for constructing meaningful
 * `name` and `filename` values (e.g. `"cluster-plan"`, `"cluster-plan.html"`).
 */
export function createArtifactUploader(deps: ArtifactUploaderDeps): {
  upload(params: {
    readonly name: string;
    readonly filename: string;
    readonly content: string;
  }): Promise<UploadArtifactResult>;
} {
  return {
    async upload(params) {
      guardGhes(deps.serverUrl);

      const backendIds = extractBackendIds(deps.runtimeToken);
      const hashFn = deps.createHash ?? nodeCreateHash;
      const sha256Hex = hashFn("sha256")
        .update(params.content, "utf-8")
        .digest("hex");
      const byteLength = Buffer.byteLength(params.content, "utf-8");
      const contentType = detectMimeType(params.filename);

      const transport = deps.transport ?? missingTransport;

      const { signedUploadUrl } = await createArtifact(
        {
          resultsUrl: deps.resultsUrl,
          runtimeToken: deps.runtimeToken,
          transport,
          ...(deps.sleep !== undefined && { sleep: deps.sleep }),
        },
        { name: params.name, backendIds },
      );

      await uploadBlob({
        signedUrl: signedUploadUrl,
        content: params.content,
        contentType,
        transport,
        ...(deps.sleep !== undefined && { sleep: deps.sleep }),
      });

      const { artifactId } = await finalizeArtifact(
        {
          resultsUrl: deps.resultsUrl,
          runtimeToken: deps.runtimeToken,
          transport,
          ...(deps.sleep !== undefined && { sleep: deps.sleep }),
        },
        {
          name: params.name,
          backendIds,
          size: byteLength,
          sha256Hex,
        },
      );

      return { id: artifactId, size: byteLength, sha256: sha256Hex };
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reject artifact upload for unsupported GitHub server hostnames.
 *
 * Only `github.com` and `*.ghe.com` have the Actions Results Service
 * (Twirp v2). Other GHES instances would fail with confusing errors.
 */
function guardGhes(serverUrl: string | undefined): void {
  const hostname = new URL(serverUrl ?? "https://github.com").hostname;
  if (hostname === ALLOWED_HOSTNAME || hostname.endsWith(ALLOWED_SUFFIX)) {
    return;
  }
  throw new ActionsError(
    `Artifact upload is not supported on ${hostname} — ` +
      `only ${ALLOWED_HOSTNAME} and *${ALLOWED_SUFFIX} are supported`,
  );
}

/** Detect MIME type from a filename's extension. */
function detectMimeType(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return DEFAULT_MIME;
  const ext = filename.slice(dot).toLowerCase();
  return MIME_TYPES[ext] ?? DEFAULT_MIME;
}

/** Placeholder transport that throws when called — catches missing DI. */
function missingTransport(): never {
  throw new ActionsError("ArtifactUploader: no HTTP transport was provided");
}
