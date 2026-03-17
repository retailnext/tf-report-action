/**
 * Steps context parsing, validation, secure file reading, and outcome helpers.
 *
 * This module is the boundary between the external world (GitHub Actions
 * steps context JSON, files on disk) and the pure transformation pipeline.
 */

export type {
  StepData,
  Steps,
  StepResult,
  Env,
  ReaderOptions,
} from "./types.js";
export {
  isStepResult,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_DISPLAY_READ,
  DEFAULT_INIT_STEP,
  DEFAULT_VALIDATE_STEP,
  DEFAULT_PLAN_STEP,
  DEFAULT_SHOW_PLAN_STEP,
  DEFAULT_APPLY_STEP,
  DEFAULT_KNOWN_STEP_IDS,
  OUTPUT_STDOUT_FILE,
  OUTPUT_STDERR_FILE,
  OUTPUT_EXIT_CODE,
} from "./types.js";
export { parseSteps } from "./parse.js";
export type {
  ReadResult,
  ReadError,
  FileReadOutcome,
  ValidatedPath,
} from "./reader.js";
export {
  readForParse,
  readForDisplay,
  isReadError,
  getValidatedPath,
} from "./reader.js";
export {
  readStepFile,
  readStepStdout,
  readStepStdoutForDisplay,
  readStepStderrForDisplay,
  getStepStdoutPath,
} from "./io.js";
export {
  getStepOutcome,
  getExitCode,
  hasAnyFailedStep,
  hasAnyFailedKnownStep,
  buildStepOutcomes,
} from "./outcomes.js";
