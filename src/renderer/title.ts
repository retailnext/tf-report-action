/**
 * Title renderer — converts Report title fields into fixed Sections.
 *
 * Also handles the workspace dedup marker (HTML comment used by the
 * Action to find and update existing comments).
 */

import type { Report } from "../model/report.js";
import type { Section } from "../model/section.js";

/**
 * Render the title as a fixed section (always included, never degraded).
 */
export function renderTitle(report: Report): Section {
  return {
    id: "title",
    full: `## ${report.title}\n\n`,
    fixed: true,
  };
}

/**
 * Render a workspace dedup marker as a fixed section.
 * Returns undefined if no workspace is set.
 */
export function renderWorkspaceMarker(report: Report): Section | undefined {
  const workspace = getWorkspace(report);
  if (workspace === undefined) return undefined;
  return {
    id: "marker",
    full: `<!-- tf-report-action:"${escapeMarkerWorkspace(workspace)}" -->\n`,
    fixed: true,
  };
}

/** Extract workspace from any report variant. */
function getWorkspace(report: Report): string | undefined {
  switch (report.kind) {
    case "structured":
      return report.workspace;
    case "text-fallback":
      return report.workspace;
    case "workflow":
      return report.workspace;
    case "error":
      return report.workspace;
  }
}

/** Escape special characters in workspace name for safe HTML comment embedding. */
function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/-->/g, "--\\>")
    .replace(/--!>/g, "--!\\>");
}
