/**
 * Secure file reader for step output files.
 *
 * This module reads files referenced by exec-action's `stdout_file` and
 * `stderr_file` step outputs. It enforces security constraints:
 *
 * 1. **Allowed directories** — files must reside directly within an allowed
 *    directory (no subdirectory traversal). Defaults to `RUNNER_TEMP` or
 *    the OS temp directory.
 * 2. **Regular files only** — rejects symlinks-to-non-regular-files, devices,
 *    FIFOs, sockets, and directories. Prevents infinite reads from
 *    `/dev/zero` and similar.
 * 3. **Size limits** — parse reads reject files exceeding `maxFileSize`;
 *    display reads only read the first `maxDisplayRead` bytes.
 */

import { realpathSync, statSync, readFileSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ReaderOptions } from "./types.js";

/**
 * Result of a file read operation.
 *
 * `truncated` is true when the file was larger than the read limit and
 * only a prefix was returned.
 */
export interface ReadResult {
  readonly content: string;
  readonly truncated: boolean;
}

/**
 * Error result when a file cannot be read. Contains a safe error message
 * that does not expose the full file path (which may reveal runner
 * directory structure).
 */
export interface ReadError {
  readonly error: string;
}

export type FileReadOutcome = ReadResult | ReadError;

/** Type guard to check if a FileReadOutcome is an error. */
export function isReadError(result: FileReadOutcome): result is ReadError {
  return "error" in result;
}

/**
 * Read a file for parsing (full contents, bounded by `maxFileSize`).
 *
 * Use this for files whose contents will be parsed as JSON or JSONL
 * (show-plan JSON, plan JSONL, apply JSONL).
 *
 * @param filePath - Absolute or relative path to the file
 * @param options - Reader security and size options
 * @returns The file contents, or an error description
 */
export function readForParse(
  filePath: string,
  options: ReaderOptions,
): FileReadOutcome {
  const validated = validateFile(filePath, options);
  if (isReadError(validated)) {
    return validated;
  }

  const { realPath, size } = validated;

  if (size > options.maxFileSize) {
    return {
      error: `File exceeds maximum size for parsing (${formatSize(size)} > ${formatSize(options.maxFileSize)})`,
    };
  }

  try {
    const content = readFileSync(realPath, "utf-8");
    return { content, truncated: false };
  } catch {
    return { error: "Failed to read file" };
  }
}

/**
 * Read a file for display (first `maxDisplayRead` bytes only).
 *
 * Use this for files whose contents will be shown as-is in fenced code
 * blocks (failed step stdout/stderr). Large files are truncated to a
 * prefix — the full content is never loaded into memory.
 *
 * @param filePath - Absolute or relative path to the file
 * @param options - Reader security and size options
 * @returns The file contents (possibly truncated), or an error description
 */
export function readForDisplay(
  filePath: string,
  options: ReaderOptions,
): FileReadOutcome {
  const validated = validateFile(filePath, options);
  if (isReadError(validated)) {
    return validated;
  }

  const { realPath, size } = validated;
  const truncated = size > options.maxDisplayRead;
  const bytesToRead = Math.min(size, options.maxDisplayRead);

  try {
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(realPath, "r");
    try {
      readSync(fd, buffer, 0, bytesToRead, 0);
    } finally {
      closeSync(fd);
    }
    return { content: buffer.toString("utf-8"), truncated };
  } catch {
    return { error: "Failed to read file" };
  }
}

// ---------------------------------------------------------------------------
// Internal validation
// ---------------------------------------------------------------------------

interface ValidatedFile {
  readonly realPath: string;
  readonly size: number;
}

function validateFile(
  filePath: string,
  options: ReaderOptions,
): ValidatedFile | ReadError {
  // Resolve to absolute path
  const absolutePath = resolve(filePath);

  // Follow symlinks to get the real path
  let realPath: string;
  try {
    realPath = realpathSync(absolutePath);
  } catch {
    return { error: "File not found or not accessible" };
  }

  // Check that the file is directly within an allowed directory.
  // Both sides are resolved through realpathSync to normalize symlinks
  // and platform-specific path prefixes (e.g. /var vs /private/var on macOS).
  const fileDir = dirname(realPath);
  const allowed = options.allowedDirs.some((dir) => {
    try {
      return fileDir === realpathSync(resolve(dir));
    } catch {
      return false;
    }
  });
  if (!allowed) {
    return { error: "File is not in an allowed directory" };
  }

  // Stat the real path (not the symlink) to check file type and size
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(realPath);
  } catch {
    return { error: "File not found or not accessible" };
  }

  // Must be a regular file
  if (!stat.isFile()) {
    return { error: "Path is not a regular file" };
  }

  return { realPath, size: stat.size };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${String(Math.round(bytes / 1024))} KiB`;
  }
  return `${String(Math.round(bytes / (1024 * 1024)))} MiB`;
}
