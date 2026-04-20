import type { BuildOptions } from "../builder/options.js";
import type { RenderOptions } from "../model/render-options.js";
import { parsePlan } from "../parser/index.js";
import { parseState } from "../parser/state.js";
import { buildApplyReport } from "../builder/apply.js";
import { enrichReportFromState } from "../builder/state-enrichment.js";
import { renderReport } from "../renderer/index.js";
import { scanString } from "../jsonl-scanner/scan.js";

/**
 * Converts an OpenTofu/Terraform plan JSON string and apply JSONL output into
 * a GitHub-comment-ready markdown string showing what was actually changed.
 *
 * The apply report filters out "phantom" changes — resources that appeared in
 * the plan but were not actually modified during apply. It also includes
 * diagnostics (errors/warnings) and per-resource apply outcomes.
 *
 * When `stateJson` is provided, attribute values that were unknown at plan time
 * are resolved to their actual post-apply values from the state. Sensitive
 * values discovered through the state are masked as `(sensitive)`.
 *
 * @param planJson - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param applyJsonl - The JSON Lines output of `tofu apply -json` or `terraform apply -json`
 * @param options - Optional rendering options; include `stateJson` to resolve unknown values
 * @returns Markdown string suitable for a GitHub issue or PR comment body
 */
export function applyToMarkdown(
  planJson: string,
  applyJsonl: string,
  options?: BuildOptions & RenderOptions & { stateJson?: string },
): string {
  const plan = parsePlan(planJson);
  const scanResult = scanString(applyJsonl);
  const report = buildApplyReport(plan, scanResult, options);
  if (options?.stateJson !== undefined) {
    const state = parseState(options.stateJson);
    enrichReportFromState(report, state);
  }
  return renderReport(report, options);
}
