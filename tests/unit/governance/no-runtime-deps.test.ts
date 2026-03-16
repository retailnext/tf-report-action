import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("no runtime dependencies", () => {
  it("package.json has no production dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf-8"),
    ) as { dependencies?: Record<string, string> };
    const deps = pkg.dependencies;
    expect(
      deps === undefined || Object.keys(deps).length === 0,
      `Unexpected runtime dependencies: ${JSON.stringify(deps)}`,
    ).toBe(true);
  });
});
