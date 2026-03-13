import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readForParse,
  readForDisplay,
  isReadError,
} from "../../../src/steps/reader.js";
import type { ReaderOptions } from "../../../src/steps/types.js";

let tempDir: string;
let options: ReaderOptions;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "reader-test-"));
  options = {
    allowedDirs: [tempDir],
    maxFileSize: 1024,
    maxDisplayRead: 256,
  };
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeFixture(name: string, content: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("readForParse", () => {
  it("reads a file within allowed directory", () => {
    const path = writeFixture("plan.json", '{"format_version":"1.2"}');
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content).toBe('{"format_version":"1.2"}');
      expect(result.truncated).toBe(false);
    }
  });

  it("rejects file exceeding maxFileSize", () => {
    const content = "x".repeat(2048);
    const path = writeFixture("big.json", content);
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(true);
    if (isReadError(result)) {
      expect(result.error).toMatch(/exceeds maximum size/);
      expect(result.error).toMatch(/2 KiB/);
      expect(result.error).toMatch(/1 KiB/);
    }
  });

  it("reads file at exactly maxFileSize", () => {
    const content = "x".repeat(1024);
    const path = writeFixture("exact.json", content);
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content.length).toBe(1024);
      expect(result.truncated).toBe(false);
    }
  });

  it("rejects file not in allowed directory", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "other-"));
    const path = join(otherDir, "plan.json");
    writeFileSync(path, "content", "utf-8");
    try {
      const result = readForParse(path, options);
      expect(isReadError(result)).toBe(true);
      if (isReadError(result)) {
        expect(result.error).toBe("File is not in an allowed directory");
      }
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("rejects file in subdirectory of allowed directory", () => {
    const subDir = join(tempDir, "sub");
    mkdirSync(subDir);
    const path = join(subDir, "plan.json");
    writeFileSync(path, "content", "utf-8");
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(true);
    if (isReadError(result)) {
      expect(result.error).toBe("File is not in an allowed directory");
    }
  });

  it("rejects non-existent file", () => {
    const result = readForParse(join(tempDir, "nope.json"), options);
    expect(isReadError(result)).toBe(true);
    if (isReadError(result)) {
      expect(result.error).toBe("File not found or not accessible");
    }
  });

  it("rejects directory path", () => {
    const subDir = join(tempDir, "dir");
    mkdirSync(subDir);
    // Make the allowed dirs include the parent so the dirname check passes
    const opts = { ...options, allowedDirs: [tempDir] };
    const result = readForParse(subDir, opts);
    expect(isReadError(result)).toBe(true);
    if (isReadError(result)) {
      expect(result.error).toBe("Path is not a regular file");
    }
  });

  it("follows symlinks and validates the target", () => {
    const realFile = writeFixture("real.json", "content");
    const linkPath = join(tempDir, "link.json");
    symlinkSync(realFile, linkPath);
    const result = readForParse(linkPath, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content).toBe("content");
    }
  });

  it("rejects symlink to file outside allowed directory", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "other-"));
    const realFile = join(otherDir, "secret.json");
    writeFileSync(realFile, "secret", "utf-8");
    const linkPath = join(tempDir, "sneaky.json");
    symlinkSync(realFile, linkPath);
    try {
      const result = readForParse(linkPath, options);
      expect(isReadError(result)).toBe(true);
      if (isReadError(result)) {
        expect(result.error).toBe("File is not in an allowed directory");
      }
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("supports multiple allowed directories", () => {
    const dir2 = mkdtempSync(join(tmpdir(), "dir2-"));
    const path = join(dir2, "plan.json");
    writeFileSync(path, "content", "utf-8");
    try {
      const opts = { ...options, allowedDirs: [tempDir, dir2] };
      const result = readForParse(path, opts);
      expect(isReadError(result)).toBe(false);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("reads empty file", () => {
    const path = writeFixture("empty.json", "");
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content).toBe("");
      expect(result.truncated).toBe(false);
    }
  });

  it("error does not contain file path", () => {
    const path = join(tempDir, "does-not-exist.json");
    const result = readForParse(path, options);
    expect(isReadError(result)).toBe(true);
    if (isReadError(result)) {
      expect(result.error).not.toContain(tempDir);
      expect(result.error).not.toContain("does-not-exist");
    }
  });
});

describe("readForDisplay", () => {
  it("reads a small file completely", () => {
    const path = writeFixture("output.txt", "hello world");
    const result = readForDisplay(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content).toBe("hello world");
      expect(result.truncated).toBe(false);
    }
  });

  it("truncates file exceeding maxDisplayRead", () => {
    const content = "a".repeat(512);
    const path = writeFixture("big.txt", content);
    const result = readForDisplay(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content.length).toBe(256);
      expect(result.content).toBe("a".repeat(256));
      expect(result.truncated).toBe(true);
    }
  });

  it("does NOT reject large files (unlike readForParse)", () => {
    // Display reads should work on any size file — they just truncate
    const content = "b".repeat(2048);
    const path = writeFixture("huge.txt", content);
    const result = readForDisplay(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content.length).toBe(256);
      expect(result.truncated).toBe(true);
    }
  });

  it("applies same security checks as readForParse", () => {
    const result = readForDisplay(join(tempDir, "nope.txt"), options);
    expect(isReadError(result)).toBe(true);
  });

  it("reads empty file", () => {
    const path = writeFixture("empty.txt", "");
    const result = readForDisplay(path, options);
    expect(isReadError(result)).toBe(false);
    if (!isReadError(result)) {
      expect(result.content).toBe("");
      expect(result.truncated).toBe(false);
    }
  });
});

describe("isReadError", () => {
  it("returns true for error results", () => {
    expect(isReadError({ error: "something" })).toBe(true);
  });

  it("returns false for success results", () => {
    expect(isReadError({ content: "data", truncated: false })).toBe(false);
  });
});
