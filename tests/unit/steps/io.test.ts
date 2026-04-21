import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readStepFile,
  readStepStdout,
  readStepStderr,
  peekStepStdout,
  peekStepStderr,
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
};

describe("readStepFile", () => {
  it("reads an existing file (full content)", () => {
    const filePath = writeFixture("parse-out.txt", "plan output");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = readStepFile(step, "stdout_file", opts);
    expect(result).toEqual({ content: "plan output" });
  });

  it("returns { noFile: true } when the output key is missing", () => {
    const step: StepData = { outputs: { stderr_file: "/some/path" } };
    const result = readStepFile(step, "stdout_file", opts);
    expect(result).toEqual({ noFile: true });
  });

  it("returns { noFile: true } when outputs is undefined", () => {
    const step: StepData = {};
    const result = readStepFile(step, "stdout_file", opts);
    expect(result).toEqual({ noFile: true });
  });

  it("returns { error } when the file does not exist", () => {
    const step: StepData = {
      outputs: { stdout_file: join(tempDir, "nonexistent.txt") },
    };
    const result = readStepFile(step, "stdout_file", opts);
    expect(result).toHaveProperty("error");
    expect(typeof result.error).toBe("string");
  });
});

describe("readStepStdout", () => {
  it("reads full stdout content", () => {
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

describe("readStepStderr", () => {
  it("reads full stderr content", () => {
    const filePath = writeFixture("stderr-full.txt", "full stderr");
    const step: StepData = { outputs: { stderr_file: filePath } };
    const result = readStepStderr(step, opts);
    expect(result).toEqual({ content: "full stderr" });
  });

  it("returns { noFile: true } when no stderr_file output", () => {
    const step: StepData = {};
    const result = readStepStderr(step, opts);
    expect(result).toEqual({ noFile: true });
  });
});

describe("peekStepStdout", () => {
  it("reads a small file fully", () => {
    const filePath = writeFixture("stdout-peek-small.txt", "hi");
    const step: StepData = { outputs: { stdout_file: filePath } };
    const result = peekStepStdout(step, opts);
    expect(result).toEqual({ content: "hi" });
  });

  it("returns { noFile: true } when no stdout_file output", () => {
    const step: StepData = {};
    const result = peekStepStdout(step, opts);
    expect(result).toEqual({ noFile: true });
  });
});

describe("peekStepStderr", () => {
  it("reads a small stderr file", () => {
    const filePath = writeFixture("stderr-peek.txt", "warning");
    const step: StepData = { outputs: { stderr_file: filePath } };
    const result = peekStepStderr(step, opts);
    expect(result).toEqual({ content: "warning" });
  });

  it("returns { noFile: true } when no stderr_file output", () => {
    const step: StepData = { outputs: { stdout_file: "/some/path" } };
    const result = peekStepStderr(step, opts);
    expect(result).toEqual({ noFile: true });
  });
});
