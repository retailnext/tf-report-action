import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Parse the major Node.js version from `action.yml` `runs.using` field. */
function deriveNodeMajor(): string {
  const content = readFileSync(resolve(ROOT, "action.yml"), "utf-8");
  const match = /^\s*using:\s*['"]?node(\d+)['"]?\s*$/m.exec(content);
  if (!match?.[1]) {
    throw new Error("Could not find `runs.using: nodeXX` in action.yml");
  }
  return match[1];
}

const MAJOR = deriveNodeMajor();

describe("Node.js version governance", () => {
  it("action.yml derives a valid major version", () => {
    expect(Number(MAJOR)).toBeGreaterThanOrEqual(18);
  });

  it(`.node-version contains exactly "${MAJOR}\\n"`, () => {
    const content = readFileSync(resolve(ROOT, ".node-version"), "utf-8");
    expect(content).toBe(`${MAJOR}\n`);
  });

  it(`package.json engines.node equals ">=${MAJOR}.0.0"`, () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf-8"),
    ) as { engines?: { node?: string } };
    expect(pkg.engines?.node).toBe(`>=${MAJOR}.0.0`);
  });

  it(`@types/node version starts with ^${MAJOR}.`, () => {
    const pkg = JSON.parse(
      readFileSync(resolve(ROOT, "package.json"), "utf-8"),
    ) as { devDependencies?: Record<string, string> };
    const typesNode = pkg.devDependencies?.["@types/node"];
    if (typesNode === undefined) return; // not present — nothing to check
    expect(typesNode).toMatch(new RegExp(`^\\^${MAJOR}\\.`));
  });

  it("all setup-node steps use node-version-file, not node-version", () => {
    const workflowDir = resolve(ROOT, ".github/workflows");
    const files = readdirSync(workflowDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(resolve(workflowDir, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!/uses:\s*actions\/setup-node/.test(line)) continue;

        // Collect the `with:` block following this step
        const withBlock: string[] = [];
        let j = i + 1;
        // Skip to the `with:` line
        while (j < lines.length && !/^\s*with:/.test(lines[j]!)) {
          // If we hit another step-level key, there's no `with:` block
          if (/^\s*-\s/.test(lines[j]!) || /^\s*\w+:/.test(lines[j]!)) break;
          j++;
        }
        if (j < lines.length && /^\s*with:/.test(lines[j]!)) {
          j++;
          // Collect indented lines under `with:`
          const withIndent = /^(\s*)/.exec(lines[j] ?? "")?.[1]?.length ?? 0;
          while (j < lines.length) {
            const l = lines[j]!;
            const indent = /^(\s*)/.exec(l)?.[1]?.length ?? 0;
            if (l.trim() === "" || indent >= withIndent) {
              withBlock.push(l);
              j++;
            } else {
              break;
            }
          }
        }

        const block = withBlock.join("\n");
        expect(
          block,
          `${file}: setup-node step at line ${String(i + 1)} must have node-version-file`,
        ).toMatch(/node-version-file:\s*.node-version/);
        expect(
          block,
          `${file}: setup-node step at line ${String(i + 1)} must NOT have node-version:`,
        ).not.toMatch(/(?<!\S)node-version:\s/);
      }
    }
  });
});
