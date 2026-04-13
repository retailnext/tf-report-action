/**
 * Comment deduplication marker.
 *
 * Builds HTML comment markers embedded in the comment body to identify
 * and deduplicate comments by workspace. The marker format must match
 * the parsing logic in the renderer's title module.
 */

/**
 * Escape special characters in a workspace name for safe HTML comment
 * embedding.  Must match the logic in `src/renderer/title.ts`.
 */
export function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/(--!?)>/g, "$1\\>");
}

/** Build the workspace dedup marker HTML comment. */
export function buildMarker(workspace: string): string {
  return `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->`;
}
