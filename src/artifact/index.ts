/**
 * Artifact upload module — public API.
 *
 * Provides the `createArtifactUploader` factory for uploading single-file
 * artifacts to GitHub Actions via the Twirp v2 protocol.
 */

export { createArtifactUploader } from "./upload.js";
export type { UploadArtifactResult, ArtifactUploaderDeps } from "./types.js";
