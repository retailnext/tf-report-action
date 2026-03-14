/**
 * Step issue builder — constructs StepIssue models from step data.
 *
 * Reads step stdout/stderr via steps/io, classifies outcomes, and produces
 * a StepIssue model ready for rendering. No markdown generation happens here.
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { StepIssue } from "../model/step-issue.js";
import { readStepStdoutForDisplay, readStepStderrForDisplay } from "../steps/io.js";
import { getStepOutcome } from "../steps/outcomes.js";

/**
 * Build a StepIssue from a step that had a failure or diagnostic.
 *
 * @param step - Step data (outcome, outputs with file paths)
 * @param stepId - Step identifier for display
 * @param readerOpts - Security and size constraints for reading step files
 * @param diagnostic - Optional diagnostic message (e.g. "Plan output could not be parsed: ...")
 */
export function buildStepIssue(
  step: StepData,
  stepId: string,
  readerOpts: ReaderOptions,
  diagnostic?: string,
): StepIssue {
  const outcome = getStepOutcome(step);
  const isFailed = outcome === "failure";

  let heading: string;
  if (isFailed) {
    heading = `\`${stepId}\` failed`;
  } else if (diagnostic) {
    heading = `\`${stepId}\`: output could not be parsed`;
  } else {
    heading = `\`${stepId}\` ${outcome}`;
  }

  const stdoutRead = readStepStdoutForDisplay(step, readerOpts);
  const stderrRead = readStepStderrForDisplay(step, readerOpts);

  const issue: StepIssue = { id: stepId, heading, isFailed };
  if (diagnostic !== undefined) (issue as { diagnostic: string }).diagnostic = diagnostic;
  if (stdoutRead.content !== undefined) (issue as { stdout: string }).stdout = stdoutRead.content;
  if (stdoutRead.truncated === true) (issue as { stdoutTruncated: boolean }).stdoutTruncated = true;
  if (stdoutRead.error !== undefined) (issue as { stdoutError: string }).stdoutError = stdoutRead.error;
  if (stderrRead.content !== undefined) (issue as { stderr: string }).stderr = stderrRead.content;
  if (stderrRead.truncated === true) (issue as { stderrTruncated: boolean }).stderrTruncated = true;
  if (stderrRead.error !== undefined) (issue as { stderrError: string }).stderrError = stderrRead.error;
  return issue;
}
