/**
 * Process the validate step output and enrich the report.
 *
 * Extracts diagnostics from validate JSON output and creates StepIssues
 * for failed validate steps.
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { Report } from "../model/report.js";
import type { UIDiagnostic } from "../tfjson/machine-readable-ui.js";
import { getStepOutcome } from "../steps/outcomes.js";
import { readStepStdout } from "../steps/io.js";
import { parseValidateOutput } from "../parser/index.js";
import { buildStepIssue } from "./step-issues.js";
import { uiDiagnosticToModel } from "./process-helpers.js";

/**
 * Process the validate step: extract diagnostics from JSON output, or
 * create a StepIssue if the step failed.
 */
export function processValidateStep(
  step: StepData,
  stepId: string,
  report: Report,
  readerOpts: ReaderOptions,
): void {
  const outcome = getStepOutcome(step);

  if (outcome === "failure") {
    report.issues.push(buildStepIssue(step, stepId, readerOpts));
  }

  // Try to parse validate JSON output for diagnostics
  const stdoutRead = readStepStdout(step, readerOpts);
  if (stdoutRead.content !== undefined) {
    try {
      const validateOutput = parseValidateOutput(stdoutRead.content);
      if (validateOutput.diagnostics.length > 0) {
        const diagnostics = validateOutput.diagnostics.map((d: UIDiagnostic) =>
          uiDiagnosticToModel(d, "validate"),
        );
        report.diagnostics = [...(report.diagnostics ?? []), ...diagnostics];
      }
    } catch {
      // Not parseable as validate JSON — not an error, just no diagnostics
    }
  }
}
