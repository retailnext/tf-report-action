/**
 * Tier detection — classifies available step data into a processing tier.
 *
 * - Tier 1: structured plan JSON available (show-plan step succeeded with readable output)
 * - Tier 3: raw text fallback (plan or apply step has readable stdout but no JSON plan)
 * - Tier 4: general workflow (no plan-related output at all)
 *
 * The tier determines which Report variant the builder will produce.
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { StepFileRead } from "../model/step-file-read.js";
import { readStepStdout } from "../steps/io.js";
import { getStepOutcome } from "../steps/outcomes.js";
import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/** Discriminated union of detected tiers. */
export type Tier =
  | { readonly kind: "tier1"; readonly showPlanJson: string }
  | { readonly kind: "tier3"; readonly planRead?: StepFileRead; readonly applyRead?: StepFileRead; readonly readErrors: string[] }
  | { readonly kind: "tier4" };

/**
 * Detect the processing tier based on available step data.
 *
 * @param showPlanStep - Step data for `terraform show -json <plan>` (may be undefined)
 * @param planStep - Step data for `terraform plan` (may be undefined)
 * @param applyStep - Step data for `terraform apply` (may be undefined)
 * @param readerOpts - Security and size constraints for reading step files
 */
export function detectTier(
  showPlanStep: StepData | undefined,
  planStep: StepData | undefined,
  applyStep: StepData | undefined,
  readerOpts: ReaderOptions,
): Tier {
  const readErrors: string[] = [];

  // Tier 1: show-plan JSON available
  if (showPlanStep) {
    const outcome = getStepOutcome(showPlanStep);
    if (outcome === "success") {
      const read = readStepStdout(showPlanStep, readerOpts);
      if (read.content !== undefined) {
        return { kind: "tier1", showPlanJson: read.content };
      }
      if (read.error) {
        readErrors.push(`${DIAGNOSTIC_WARNING} show-plan stdout: ${read.error}`);
      } else if (read.noFile) {
        readErrors.push(`${DIAGNOSTIC_WARNING} show-plan: stdout_file output missing in steps`);
      }
    }
  }

  // Tier 3: Raw text fallback (plan or apply step present but no structured data)
  if (planStep || applyStep) {
    let planRead: StepFileRead | undefined;
    let applyRead: StepFileRead | undefined;
    if (planStep) {
      planRead = readStepStdout(planStep, readerOpts);
      if (planRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} plan stdout: ${planRead.error}`);
      else if (planRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} plan: stdout_file output missing in steps`);
    }
    if (applyStep && getStepOutcome(applyStep) !== "skipped") {
      applyRead = readStepStdout(applyStep, readerOpts);
      if (applyRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} apply stdout: ${applyRead.error}`);
      else if (applyRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} apply: stdout_file output missing in steps`);
    }
    const result: Tier = { kind: "tier3", readErrors };
    if (planRead) (result as { planRead?: StepFileRead }).planRead = planRead;
    if (applyRead) (result as { applyRead?: StepFileRead }).applyRead = applyRead;
    return result;
  }

  // Tier 4: General workflow
  return { kind: "tier4" };
}
