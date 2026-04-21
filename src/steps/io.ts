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
  readPeek,
  isReadError,
  getValidatedPath,
} from "./reader.js";
import { OUTPUT_STDOUT_FILE, OUTPUT_STDERR_FILE } from "./types.js";

/**
 * Read a step output file by output key (full content, bounded by maxFileSize).
 *
 * @param step - Step data containing outputs with file paths
 * @param outputKey - The output key (e.g. "stdout_file", "stderr_file")
 * @param readerOpts - Security and size constraints
 */
export function readStepFile(
  step: StepData,
  outputKey: string,
  readerOpts: ReaderOptions,
): StepFileRead {
  const filePath = step.outputs?.[outputKey];
  if (!filePath) return { noFile: true };
  const result = readForParse(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
}

/** Read a step's stdout file for parsing (full content, bounded by maxFileSize). */
export function readStepStdout(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  return readStepFile(step, OUTPUT_STDOUT_FILE, readerOpts);
}

/** Read a step's stderr file (full content, bounded by maxFileSize). */
export function readStepStderr(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  return readStepFile(step, OUTPUT_STDERR_FILE, readerOpts);
}

/**
 * Peek at the first bytes of a step's stdout file for format detection.
 *
 * Reads only a small prefix (8 KiB) — enough to check whether the file
 * contains JSONL output without loading the full content.
 */
export function peekStepStdout(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  const filePath = step.outputs?.[OUTPUT_STDOUT_FILE];
  if (!filePath) return { noFile: true };
  const result = readPeek(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
}

/**
 * Peek at the first bytes of a step's stderr file for content detection.
 *
 * Reads only a small prefix — enough to determine whether stderr has
 * non-whitespace content without loading a potentially large file.
 */
export function peekStepStderr(
  step: StepData,
  readerOpts: ReaderOptions,
): StepFileRead {
  const filePath = step.outputs?.[OUTPUT_STDERR_FILE];
  if (!filePath) return { noFile: true };
  const result = readPeek(filePath, readerOpts);
  if (isReadError(result)) return { error: result.error };
  return { content: result.content };
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
