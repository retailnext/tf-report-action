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

/** Extract workspace from the report. */
function getWorkspace(report: Report): string | undefined {
  return report.workspace;
}

/**
 * Escape workspace name for safe HTML comment embedding.
 *
 * HTML comments are terminated by `-->` (or `--!>`). Backslash escaping
 * has no special meaning inside HTML comments, so we insert a zero-width
 * space between consecutive dashes to break `--` sequences and prevent
 * premature comment termination.
 */
function escapeMarkerWorkspace(workspace: string): string {
  return workspace
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/--/g, "-\u200B-");
}
