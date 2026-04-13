/**
 * Comment module — comment structure, marker, footer, and body assembly.
 *
 * Everything about how the final GitHub comment is constructed that does
 * NOT require GitHub API calls. Pure functions operating on strings and
 * environment variables.
 */

export { escapeMarkerWorkspace, buildMarker } from "./marker.js";
export {
  formatTimestamp,
  buildLogsUrl,
  parseRepo,
  buildFooter,
  calculateBudget,
  COMMENT_LIMIT,
  OVERHEAD_RESERVE,
} from "./footer.js";
export { buildTruncation, assembleCommentBody } from "./body.js";
