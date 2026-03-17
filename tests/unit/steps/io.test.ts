import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readStepFile,
  readStepStdout,
  readStepStdoutForDisplay,
  readStepStderrForDisplay,
} from "../../../src/steps/io.js";
import type { StepData, ReaderOptions } from "../../../src/steps/types.js";

const tempDir = mkdtempSync(join(tmpdir(), "io-test-"));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

const opts: ReaderOptions = {
  allowedDirs: [tempDir],
  maxFileSize: 1024,
  maxDisplayRead: 32,
};

describe("readStepFile", () => {
  it("reads an existing file for parsing (forDisplay=false)", () => {
    const filePath = writeFixture("parse-out.txt", "plan output");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepFile(step, "stdout_file", opts, false);
    expect(result).toEqual({ content: "plan output" });
  });

  it("reads an existing file for display (forDisplay=true, truncates)", () => {
    const content = "x".repeat(64);
    const filePath = writeFixture("display-out.txt", content);
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepFile(step, "stdout_file", opts, true);
    expect(result).toEqual({ content: "x".repeat(32), truncated: true });
  });

  it("returns { noFile: true } when the output key is missing", () => {
    const step: StepData = { outputs: { stderr_file: "/some/path" } };
    const result = readStepFile(step, "stdout_file", opts, false);
    expect(result).toEqual({ noFile: true });
  });

  it("returns { noFile: true } when outputs is undefined", () => {
    const step: StepData = {};
    const result = readStepFile(step, "stdout_file", opts, false);
    expect(result).toEqual({ noFile: true });
  });

  it("returns { error } when the file does not exist", () => {
    const step: StepData = {
      outputs: { stdout_file: join(tempDir, "nonexistent.txt") },
    };
    const result = readStepFile(step, "stdout_file", opts, false);
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });

  it("returns { content } without truncated when file fits display limit", () => {
    const filePath = writeFixture("small-display.txt", "short");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepFile(step, "stdout_file", opts, true);
    expect(result).toEqual({ content: "short" });
  });
});

describe("readStepStdout", () => {
  it("delegates to readStepFile with stdout_file and forDisplay=false", () => {
    const filePath = writeFixture("stdout-full.txt", "full stdout");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepStdout(step, opts);
    expect(result).toEqual({ content: "full stdout" });
  });

  it("returns { noFile: true } when no stdout_file output", () => {
    const step: StepData = {};
    const result = readStepStdout(step, opts);
    expect(result).toEqual({ noFile: true });
  });
});

describe("readStepStdoutForDisplay", () => {
  it("delegates to readStepFile with stdout_file and forDisplay=true", () => {
    const content = "y".repeat(64);
    const filePath = writeFixture("stdout-display.txt", content);
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepStdoutForDisplay(step, opts);
    expect(result).toEqual({ content: "y".repeat(32), truncated: true });
  });

  it("reads small stdout without truncation", () => {
    const filePath = writeFixture("stdout-small.txt", "hi");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepStdoutForDisplay(step, opts);
    expect(result).toEqual({ content: "hi" });
  });
});

describe("readStepStderrForDisplay", () => {
  it("delegates to readStepFile with stderr_file and forDisplay=true", () => {
    const content = "z".repeat(64);
    const filePath = writeFixture("stderr-display.txt", content);
    const step: StepData = { outputs: { stderr_file: filePath } };
    const result = readStepStderrForDisplay(step, opts);
    expect(result).toEqual({ content: "z".repeat(32), truncated: true });
  });

  it("returns { noFile: true } when no stderr_file output", () => {
    const step: StepData = { outputs: { stdout_file: "/some/path" } };
    const result = readStepStderrForDisplay(step, opts);
    expect(result).toEqual({ noFile: true });
  });
});
