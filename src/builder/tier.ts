/**
 * Tier detection — classifies available step data into a processing tier.
 *
 * - Tier 1: structured plan JSON available (show-plan step succeeded with readable output)
 * - Tier 2: no show-plan, but plan/apply JSONL available (structured data from JSONL scanner)
 * - Tier 3: raw text fallback (plan or apply step has readable stdout but not parseable JSONL)
 * - Tier 4: general workflow (no plan-related output at all)
 *
 * The tier determines which processing path the builder takes. With the
 * unified Report model, all tiers contribute to the same Report — the tier
 * governs which fields get populated.
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { StepFileRead } from "../model/step-file-read.js";
import { readStepStdout, getStepStdoutPath } from "../steps/io.js";
import { getStepOutcome } from "../steps/outcomes.js";
import { isJsonLines } from "../jsonl-scanner/detect.js";
import { DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/** Discriminated union of detected tiers. */
export type Tier =
  | { readonly kind: "tier1"; readonly showPlanJson: string }
  | {
      readonly kind: "tier2";
      readonly planJsonlPath?: string;
      readonly applyJsonlPath?: string;
      readonly readErrors: string[];
    }
  | { readonly kind: "tier3"; readonly planRead?: StepFileRead; readonly applyRead?: StepFileRead; readonly readErrors: string[] }
  | { readonly kind: "tier4" };

/**
 * Detect the processing tier based on available step data.
 *
 * @param showPlanStep - Step data for `tofu show -json <plan>` (may be undefined)
 * @param planStep - Step data for `tofu plan` (may be undefined)
 * @param applyStep - Step data for `tofu apply` (may be undefined)
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

  // Check plan/apply step presence and JSONL-ness
  if (planStep || applyStep) {
    let planJsonlPath: string | undefined;
    let applyJsonlPath: string | undefined;
    let planRead: StepFileRead | undefined;
    let applyRead: StepFileRead | undefined;
    let hasAnyJsonl = false;

    if (planStep) {
      const path = getStepStdoutPath(planStep, readerOpts);
      if (path) {
        const read = readStepStdout(planStep, readerOpts);
        if (read.content !== undefined) {
          const firstLines = read.content.split("\n", 10);
          if (isJsonLines(firstLines)) {
            planJsonlPath = path;
            hasAnyJsonl = true;
          } else {
            planRead = read;
          }
        } else if (read.error) {
          readErrors.push(`${DIAGNOSTIC_WARNING} plan stdout: ${read.error}`);
        } else if (read.noFile) {
          readErrors.push(`${DIAGNOSTIC_WARNING} plan: stdout_file output missing in steps`);
        }
      } else {
        // Path validation failed or no stdout_file output
        const rawRead = readStepStdout(planStep, readerOpts);
        if (rawRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} plan stdout: ${rawRead.error}`);
        else if (rawRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} plan: stdout_file output missing in steps`);
        else planRead = rawRead;
      }
    }

    if (applyStep && getStepOutcome(applyStep) !== "skipped") {
      const path = getStepStdoutPath(applyStep, readerOpts);
      if (path) {
        const read = readStepStdout(applyStep, readerOpts);
        if (read.content !== undefined) {
          const firstLines = read.content.split("\n", 10);
          if (isJsonLines(firstLines)) {
            applyJsonlPath = path;
            hasAnyJsonl = true;
          } else {
            applyRead = read;
          }
        } else if (read.error) {
          readErrors.push(`${DIAGNOSTIC_WARNING} apply stdout: ${read.error}`);
        } else if (read.noFile) {
          readErrors.push(`${DIAGNOSTIC_WARNING} apply: stdout_file output missing in steps`);
        }
      } else {
        const rawRead = readStepStdout(applyStep, readerOpts);
        if (rawRead.error) readErrors.push(`${DIAGNOSTIC_WARNING} apply stdout: ${rawRead.error}`);
        else if (rawRead.noFile) readErrors.push(`${DIAGNOSTIC_WARNING} apply: stdout_file output missing in steps`);
        else applyRead = rawRead;
      }
    }

    // Tier 2: at least one JSONL source available
    if (hasAnyJsonl) {
      const result: Tier = { kind: "tier2", readErrors };
      if (planJsonlPath) (result as { planJsonlPath: string }).planJsonlPath = planJsonlPath;
      if (applyJsonlPath) (result as { applyJsonlPath: string }).applyJsonlPath = applyJsonlPath;
      return result;
    }

    // Tier 3: Raw text fallback
    if (planRead || applyRead) {
      const result: Tier = { kind: "tier3", readErrors };
      if (planRead) (result as { planRead: StepFileRead }).planRead = planRead;
      if (applyRead) (result as { applyRead: StepFileRead }).applyRead = applyRead;
      return result;
    }

    // Plan/apply steps exist but no readable output — still Tier 3
    // (IaC steps were present, so this is not a generic workflow)
    return { kind: "tier3", readErrors };
  }

  // Tier 4: General workflow
  return { kind: "tier4" };
}
