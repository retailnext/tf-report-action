import { describe, it, expect, vi, afterEach } from "vitest";
import { actionsLogger } from "../../../src/logger/index.js";

describe("actionsLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes warning annotations to stderr", () => {
    const write = vi.fn();
    vi.spyOn(process.stderr, "write").mockImplementation(write);
    actionsLogger().warning("test warning");
    expect(write).toHaveBeenCalledWith("::warning::test warning\n");
  });

  it("writes error annotations to stderr", () => {
    const write = vi.fn();
    vi.spyOn(process.stderr, "write").mockImplementation(write);
    actionsLogger().error("test error");
    expect(write).toHaveBeenCalledWith("::error::test error\n");
  });

  it("writes info messages to stdout", () => {
    const write = vi.fn();
    vi.spyOn(process.stdout, "write").mockImplementation(write);
    actionsLogger().info("test info");
    expect(write).toHaveBeenCalledWith("test info\n");
  });
});
