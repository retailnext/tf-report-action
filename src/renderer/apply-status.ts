import type { ApplyStatus } from "../model/apply-status.js";
import type { MarkdownWriter } from "./writer.js";
import { ACTION_SYMBOLS } from "../model/plan-action.js";
import { STATUS_SUCCESS, STATUS_FAILURE } from "../model/status-icons.js";

/**
 * Renders a table of per-resource apply outcomes showing success or
 * failure status, the action taken, and elapsed time.
 */
export function renderApplyStatuses(
  statuses: readonly ApplyStatus[],
  writer: MarkdownWriter,
): void {
  writer.heading("Resource Outcomes", 3);
  writer.tableHeader(["Status", "Resource", "Action", "Elapsed"]);

  for (const s of statuses) {
    const icon = s.success ? STATUS_SUCCESS : STATUS_FAILURE;
    const actionLabel = ACTION_SYMBOLS[s.action];
    const elapsed =
      s.elapsed !== undefined ? `${s.elapsed.toFixed(0)}s` : "";
    writer.tableRow([icon, `\`${s.address}\``, actionLabel, elapsed]);
  }

  writer.blankLine();
}
