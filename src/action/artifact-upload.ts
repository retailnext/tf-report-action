/**
 * Action-layer artifact upload orchestrator.
 *
 * Attempts to upload the full un-truncated report as an HTML artifact.
 * Returns the artifact view URL on success, or `undefined` when upload
 * is not possible (GHES, missing env vars) or fails. This function never
 * throws — all errors are caught and logged via the injected `Logger`.
 *
 * All I/O dependencies are injected via parameters for testability.
 */

import type { Hash } from "node:crypto";
import type { Env } from "../env/index.js";
import type { ArtifactTransport } from "../artifact/types.js";
import { createArtifactUploader } from "../artifact/upload.js";
import { buildHtmlPage } from "../html/page.js";
import type { Logger } from "../logger/index.js";

/** Injectable dependencies for the upload process. */
export interface TryUploadDeps {
  /** HTTP transport — reuse the same proxy-aware transport from main. */
  readonly transport?: ArtifactTransport;
  /** Hash factory — injectable for testing. */
  readonly createHash?: (algorithm: string) => Hash;
  /** Sleep implementation — injectable to avoid real delays in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Parameters for `tryUploadFullReport`. */
export interface TryUploadParams {
  /** Pre-rendered HTML content from `ComposedReport.render("html").output`. */
  readonly htmlContent: string;
  /** Injected environment variables. */
  readonly env: Env;
  /** Artifact display name and filename, e.g. "cluster-plan-report.html". */
  readonly artifactName: string;
  /** Logger for warnings on failure. */
  readonly logger: Logger;
  /** Optional transport/crypto/sleep overrides. */
  readonly deps?: TryUploadDeps;
}

/**
 * Attempt to upload the full un-truncated report as an HTML artifact.
 *
 * Receives pre-rendered HTML from `ComposedReport.render("html")` and wraps
 * it in a standalone HTML page with embedded CSS. No GitHub `/markdown` API
 * call is needed.
 *
 * Returns the artifact view URL on success, or `undefined` if upload is
 * not possible (GHES, missing env vars) or fails (network error, API error).
 */
export async function tryUploadFullReport(
  params: TryUploadParams,
): Promise<string | undefined> {
  try {
    const runtimeToken = params.env["ACTIONS_RUNTIME_TOKEN"];
    const resultsUrl = params.env["ACTIONS_RESULTS_URL"];
    const runId = params.env["GITHUB_RUN_ID"];
    if (
      runtimeToken === undefined ||
      runtimeToken === "" ||
      resultsUrl === undefined ||
      resultsUrl === "" ||
      runId === undefined ||
      runId === ""
    ) {
      return undefined;
    }

    const dotIndex = params.artifactName.lastIndexOf(".");
    const pageTitle =
      dotIndex > 0
        ? params.artifactName.slice(0, dotIndex)
        : params.artifactName;
    const htmlPage = buildHtmlPage(params.htmlContent, pageTitle);

    const filename = params.artifactName;
    const serverUrl = params.env["GITHUB_SERVER_URL"];
    const repoContext = params.env["GITHUB_REPOSITORY"] ?? "";
    const uploader = createArtifactUploader({
      runtimeToken,
      resultsUrl,
      ...(serverUrl !== undefined && { serverUrl }),
      ...(params.deps?.transport !== undefined && {
        transport: params.deps.transport,
      }),
      ...(params.deps?.createHash !== undefined && {
        createHash: params.deps.createHash,
      }),
      ...(params.deps?.sleep !== undefined && { sleep: params.deps.sleep }),
    });

    const result = await uploader.upload({
      name: params.artifactName,
      filename,
      content: htmlPage,
    });

    const artifactServerUrl =
      params.env["GITHUB_SERVER_URL"] ?? "https://github.com";
    return `${artifactServerUrl}/${repoContext}/actions/runs/${runId}/artifacts/${String(result.id)}`;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const log = params.logger;
    log.warning(`Artifact upload failed: ${msg}`);
    return undefined;
  }
}
