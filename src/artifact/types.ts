/**
 * Shared types for the artifact upload module.
 *
 * Defines the transport type alias, backend IDs extracted from the Actions
 * runtime JWT, and the top-level uploader dependency interface. The transport
 * type mirrors the shape used by the GitHub client but is defined here to
 * avoid a cross-layer import from `src/github/`.
 */

import type { HttpResponse } from "../http/index.js";

/**
 * HTTP transport function for artifact API calls.
 *
 * Same shape as the GitHub client's transport — the composition root wires
 * the same proxy-aware `httpRequest` closure into both modules.
 */
export type ArtifactTransport = (
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
) => Promise<HttpResponse>;

/** Backend IDs extracted from the `ACTIONS_RUNTIME_TOKEN` JWT `scp` claim. */
export interface BackendIds {
  readonly workflowRunBackendId: string;
  readonly workflowJobRunBackendId: string;
}

/** Result of a successful artifact upload. */
export interface UploadArtifactResult {
  readonly id: number;
  readonly size: number;
  readonly sha256: string;
}

/**
 * Dependencies for the artifact uploader.
 *
 * All fields beyond `runtimeToken` and `resultsUrl` are optional — the
 * uploader falls back to real implementations when omitted. Tests inject
 * fakes for all I/O-performing dependencies.
 */
export interface ArtifactUploaderDeps {
  /** Actions runtime token (ACTIONS_RUNTIME_TOKEN env var). */
  readonly runtimeToken: string;
  /** Actions results service URL (ACTIONS_RESULTS_URL env var). */
  readonly resultsUrl: string;
  /** GitHub server URL for GHES guard. Default: "https://github.com". */
  readonly serverUrl?: string;
  /** HTTP transport — injected for proxy support and testability. */
  readonly transport?: ArtifactTransport;
  /** Hash factory — injectable for testing SHA-256 computation. */
  readonly createHash?: (algorithm: string) => import("node:crypto").Hash;
  /** Sleep implementation — injectable to avoid real delays in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}
