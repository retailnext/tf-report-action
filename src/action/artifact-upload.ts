/**
 * Action-layer artifact upload orchestrator.
 *
 * Attempts to upload the full un-truncated report as an HTML artifact.
 * Returns the artifact view URL on success, or `undefined` when upload
 * is not possible (GHES, missing env vars) or fails. This function never
 * throws — all errors are caught and logged as `::warning::` annotations.
 *
 * All I/O dependencies are injected via parameters for testability.
 */

import type { Env } from "../env/index.js";
import type { ArtifactTransport } from "../artifact/types.js";
import { createArtifactUploader } from "../artifact/index.js";
import { buildHtmlPage } from "../html/index.js";

/** Injectable dependencies for the upload process. */
export interface TryUploadDeps {
  /** HTTP transport — reuse the same proxy-aware transport from main. */
  readonly transport?: ArtifactTransport;
  /** Hash factory — injectable for testing. */
  readonly createHash?: (algorithm: string) => import("node:crypto").Hash;
  /** Sleep implementation — injectable to avoid real delays in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Parameters for `tryUploadFullReport`. */
export interface TryUploadParams {
  /** Full un-truncated markdown (from `ReportFromStepsResult.fullMarkdown`). */
  readonly fullMarkdown: string;
  /**
   * Render markdown to HTML via the GitHub `/markdown` API.
   * Accepts the same parameters as `GitHubClient.renderMarkdown`.
   */
  readonly renderMarkdown: (params: {
    text: string;
    mode: "gfm";
    context: string;
  }) => Promise<string>;
  /** Injected environment variables. */
  readonly env: Env;
  /** Repository context string, e.g. "owner/repo". */
  readonly repoContext: string;
  /** Artifact display name and filename stem, e.g. "cluster-plan". */
  readonly artifactName: string;
  /** Optional transport/crypto/sleep overrides. */
  readonly deps?: TryUploadDeps;
}

/**
 * Attempt to upload the full un-truncated report as an HTML artifact.
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

    const htmlFragment = await params.renderMarkdown({
      text: params.fullMarkdown,
      mode: "gfm",
      context: params.repoContext,
    });

    const htmlPage = buildHtmlPage(htmlFragment, params.artifactName);

    const filename = `${params.artifactName}.html`;
    const serverUrl = params.env["GITHUB_SERVER_URL"];
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
    return `${artifactServerUrl}/${params.repoContext}/actions/runs/${runId}/artifacts/${String(result.id)}`;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::warning::Artifact upload failed: ${msg}\n`);
    return undefined;
  }
}
