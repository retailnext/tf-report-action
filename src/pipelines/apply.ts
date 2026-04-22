import type { BuildOptions } from "../builder/options.js";
import type { RenderOptions } from "../model/render-options.js";
import type { ComposedReport } from "../renderable/types.js";
import { parsePlan } from "../parser/index.js";
import { parseState } from "../parser/state.js";
import { buildApplyReport } from "../builder/apply.js";
import { enrichReportFromState } from "../builder/state-enrichment.js";
import { buildReportElements } from "../elements/report-elements.js";
import { composeReport } from "../elements/composed-report.js";
import { scanString } from "../jsonl-scanner/scan.js";

/**
 * Converts an OpenTofu/Terraform plan JSON and apply JSONL output into a
 * {@link ComposedReport} that can render itself to markdown or HTML on demand.
 *
 * When `stateJson` is provided, attribute values that were unknown at plan time
 * are resolved to their actual post-apply values from the state.
 *
 * @param planJson - The output of `tofu show -json <planfile>` or `terraform show -json <planfile>`
 * @param applyJsonl - The JSON Lines output of `tofu apply -json` or `terraform apply -json`
 * @param options - Optional build/render options; include `stateJson` to resolve unknown values
 * @returns A ComposedReport with progressive-enhancement rendering
 */
export function applyReport(
  planJson: string,
  applyJsonl: string,
  options?: BuildOptions & RenderOptions & { stateJson?: string },
): ComposedReport {
  const plan = parsePlan(planJson);
  const scanResult = scanString(applyJsonl);
  const report = buildApplyReport(plan, scanResult, options);
  if (options?.stateJson !== undefined) {
    const state = parseState(options.stateJson);
    enrichReportFromState(report, state);
  }
  const elements = buildReportElements(report, options);
  return composeReport(elements);
}

/**
 * Converts an OpenTofu/Terraform plan JSON string and apply JSONL output into
 * a GitHub-comment-ready markdown string showing what was actually changed.
 *
 * Convenience wrapper around {@link applyReport} for callers that only need
 * markdown output.
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
  return applyReport(planJson, applyJsonl, options).render("markdown").output;
}
