/**
 * Step-data-aware file reading wrappers.
 *
 * These functions extract file paths from step outputs and call the
 * low-level secure reader. They bridge the gap between the step data
 * model (StepData with outputs like `stdout_file`) and the reader
 * (which works with raw file paths).
 */

import type { StepData, ReaderOptions } from "./types.js";
import type { StepFileRead } from "../model/step-file-read.js";
import {
  readForParse,
  readForDisplay,
  isReadError,
  getValidatedPath,
} from "./reader.js";
import { OUTPUT_STDOUT_FILE, OUTPUT_STDERR_FILE } from "./types.js";

/**
 * Read a step output file by output key.
 *
 * @param step - Step data containing outputs with file paths
 * @param outputKey - The output key (e.g. "stdout_file", "stderr_file")
 * @param readerOpts - Security and size constraints
 * @param forDisplay - If true, reads only a prefix for display; if false, reads full content for parsing
 */
export function readStepFile(
  step: StepData,
  outputKey: string,
  readerOpts: ReaderOptions,
  forDisplay: boolean,
): StepFileRead {
  const filePath = step.outputs?.[outputKey];
  if (!filePath) return { noFile: true };
  const result = forDisplay
    ? readForDisplay(filePath, readerOpts)
    : readForParse(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  if (result.truncated) {
    return { content: result.content, truncated: true };
  }
  return { content: result.content };
}

/** Read a step's stdout file for parsing (full content, bounded by maxFileSize). */
export function readStepStdout(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts, false);
}

/** Read a step's stdout file for display (first maxDisplayRead bytes). */
export function readStepStdoutForDisplay(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts, true);
}

/** Read a step's stderr file for display (first maxDisplayRead bytes). */
export function readStepStderrForDisplay(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  return readStepFile(step, OUTPUT_STDERR_FILE, readerOpts, true);
}

/**
 * Get the validated real path to a step's stdout file without reading it.
 *
 * Returns the resolved, security-validated file path or `undefined` if the
 * step has no stdout_file output or the path fails validation. This is used
 * by the JSONL scanner which reads the file itself via chunked I/O.
 */
export function getStepStdoutPath(
  step: StepData,
  readerOpts: ReaderOptions,
): string | undefined {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return undefined;
  const result = getValidatedPath(filePath, readerOpts);
  if ("error" in result) return undefined;
  return result.realPath;
}
