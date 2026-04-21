/**
 * Step issue builder — constructs StepIssue models from step data.
 *
 * Reads step stdout/stderr via steps/io, classifies outcomes, and produces
 * a StepIssue model ready for rendering. No markdown generation happens here.
 *
 * StepIssues are created for:
 * - Failed steps (any step, including unfamiliar ones)
 * - Successful steps with non-empty stderr (surfaces warnings/deprecations)
 * - Steps with parse diagnostics (output present but couldn't be parsed)
 */

import type { StepData, ReaderOptions } from "../steps/types.js";
import type { StepIssue } from "../model/step-issue.js";
import { readStepStdout, readStepStderr, peekStepStderr } from "../steps/io.js";
import { getStepOutcome, getExitCode } from "../steps/outcomes.js";

/**
 * Build a StepIssue from a step that had a failure, warning, or diagnostic.
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
  const exitCode = getExitCode(step);

  let heading: string;
  if (isFailed) {
    heading = `\`${stepId}\` failed`;
  } else if (diagnostic) {
    heading = `\`${stepId}\`: output could not be parsed`;
  } else {
    heading = `\`${stepId}\` ${outcome}`;
  }

  const stdoutRead = readStepStdout(step, readerOpts);
  const stderrRead = readStepStderr(step, readerOpts);

  // Build with conditional spreads to preserve type safety while
  // respecting exactOptionalPropertyTypes (fields must not be undefined).
  // Only include stderr when it has non-whitespace content. An empty or
  // whitespace-only stderr is uninformative and produces a misleading
  // "(empty)" block in the rendered output.
  const stderrContent =
    stderrRead.content !== undefined && stderrRead.content.trim().length > 0
      ? stderrRead.content
      : undefined;

  const issue: StepIssue = {
    id: stepId,
    heading,
    isFailed,
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(diagnostic !== undefined ? { diagnostic } : {}),
    ...(stdoutRead.content !== undefined ? { stdout: stdoutRead.content } : {}),
    ...(stdoutRead.error !== undefined
      ? { stdoutError: stdoutRead.error }
      : {}),
    ...(stderrContent !== undefined ? { stderr: stderrContent } : {}),
    ...(stderrRead.error !== undefined
      ? { stderrError: stderrRead.error }
      : {}),
  };
  return issue;
}

/**
 * Determine whether a step warrants a StepIssue.
 *
 * A StepIssue is created when:
 * - The step **failed** (any step, including unfamiliar ones)
 * - The step succeeded but has **non-empty stderr** (surfaces warnings)
 * - A **diagnostic** message is provided (parse failure)
 *
 * This is checked by the caller before calling `buildStepIssue` to avoid
 * unnecessary file I/O for steps that don't need issue detail.
 */
export function shouldCreateStepIssue(
  step: StepData,
  readerOpts: ReaderOptions,
  diagnostic?: string,
): boolean {
  const outcome = getStepOutcome(step);
  if (outcome === "failure") return true;
  if (diagnostic !== undefined) return true;
  // Peek at stderr to check for warnings/deprecations without reading the full file
  const stderrPeek = peekStepStderr(step, readerOpts);
  return (
    stderrPeek.content !== undefined && stderrPeek.content.trim().length > 0
  );
}
