/**
 * Governance test: no cycles in the folder-level dependency graph.
 *
 * Reads the `boundaries/dependencies` rule from `eslint.config.mjs` and
 * reconstructs the folder-level directed graph. Asserts that graph is a DAG
 * (no directed cycles). If a cycle exists, the test fails with a description
 * of one such cycle.
 *
 * Also includes a self-contained test suite for the cycle-detector itself so
 * we can trust it catches violations.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Cycle detection (DFS)
// ---------------------------------------------------------------------------

/**
 * Returns a cycle as a node array (start…start) if one exists, or null if
 * the graph is a DAG.
 *
 * @param graph  Adjacency list: node → set of neighbours it may depend on.
 */
function findCycle(graph: Map<string, Set<string>>): string[] | null {
  const WHITE = 0; // not visited
  const GRAY = 1; // in current DFS stack
  const BLACK = 2; // fully explored

  const color = new Map<string, 0 | 1 | 2>();
  for (const node of graph.keys()) color.set(node, WHITE);

  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);

    for (const neighbour of graph.get(node) ?? []) {
      if (!color.has(neighbour)) continue; // external / unknown — skip
      if (color.get(neighbour) === GRAY) {
        // Found a back-edge: extract the cycle from the stack
        const cycleStart = stack.indexOf(neighbour);
        return [...stack.slice(cycleStart), neighbour];
      }
      if (color.get(neighbour) === WHITE) {
        const cycle = dfs(neighbour);
        if (cycle !== null) return cycle;
      }
    }

    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      const cycle = dfs(node);
      if (cycle !== null) return cycle;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cycle detector self-tests
// ---------------------------------------------------------------------------

describe("findCycle (self-tests)", () => {
  it("returns null for an empty graph", () => {
    expect(findCycle(new Map())).toBeNull();
  });

  it("returns null for a single node with no edges", () => {
    expect(findCycle(new Map([["a", new Set()]]))).toBeNull();
  });

  it("detects a self-loop", () => {
    const g = new Map([["a", new Set(["a"])]]);
    const cycle = findCycle(g);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("a");
  });

  it("detects a direct 2-node cycle", () => {
    const g = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]);
    const cycle = findCycle(g);
    expect(cycle).not.toBeNull();
  });

  it("detects a transitive 3-node cycle", () => {
    const g = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
    ]);
    const cycle = findCycle(g);
    expect(cycle).not.toBeNull();
  });

  it("returns null for a valid DAG", () => {
    const g = new Map([
      ["a", new Set(["b", "c"])],
      ["b", new Set(["d"])],
      ["c", new Set(["d"])],
      ["d", new Set<string>()],
    ]);
    expect(findCycle(g)).toBeNull();
  });

  it("returns null when an edge points to an unknown node (external dep)", () => {
    // External nodes (e.g. core modules) are not in the graph — skip them
    const g = new Map([["a", new Set(["node:fs"])]]);
    expect(findCycle(g)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers to extract the graph from eslint.config.mjs
// ---------------------------------------------------------------------------

interface BoundariesRule {
  from?: { element?: { type?: string } };
  allow?: ({ to?: { element?: { type?: string } } } | string)[];
}

interface EslintConfig {
  settings?: {
    "boundaries/elements"?: { type: string }[];
  };
  rules?: {
    "boundaries/dependencies"?: [
      string | number,
      { policies?: BoundariesRule[] },
    ];
  };
}

/**
 * Loads `eslint.config.mjs` and extracts the folder-level dependency graph
 * as declared in the `boundaries/dependencies` rule.
 *
 * Each key in the returned map is a `from.element.type` value; the set contains
 * every `to.element.type` value that is explicitly allowed. Only entries with
 * both `from.element.type` and `to.element.type` (local → local edges) are
 * included.
 */
async function loadGraph(): Promise<Map<string, Set<string>>> {
  const configPath = resolve(import.meta.dirname, "../../../eslint.config.mjs");
  // Dynamic import of an ESM module
  const configModule = (await import(configPath)) as {
    default: EslintConfig[];
  };
  const configs: EslintConfig[] = configModule.default;

  // Find the config block that declares boundaries/dependencies
  let depRules: BoundariesRule[] | undefined;
  for (const block of configs) {
    const rule = block.rules?.["boundaries/dependencies"];
    if (rule) {
      depRules = rule[1].policies;
      break;
    }
  }
  if (!depRules) {
    throw new Error(
      "Could not find boundaries/dependencies policies in eslint.config.mjs",
    );
  }

  // Find all declared element types so we know the full set of nodes
  let elementTypes: Set<string> | undefined;
  for (const block of configs) {
    const elements = block.settings?.["boundaries/elements"];
    if (elements) {
      elementTypes = new Set(elements.map((e) => e.type));
      break;
    }
  }
  if (!elementTypes) {
    throw new Error(
      "Could not find boundaries/elements settings in eslint.config.mjs",
    );
  }

  // Build adjacency map: only local→local edges (to.element.type entries)
  const graph = new Map<string, Set<string>>();
  for (const type of elementTypes) graph.set(type, new Set());

  for (const rule of depRules) {
    const fromType = rule.from?.element?.type;
    if (!fromType || !elementTypes.has(fromType)) continue;

    for (const entry of rule.allow ?? []) {
      if (typeof entry !== "object") continue;
      const toType = entry.to?.element?.type;
      if (toType && elementTypes.has(toType)) {
        graph.get(fromType)?.add(toType);
      }
    }
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Main governance assertion
// ---------------------------------------------------------------------------

describe("folder dependency graph (boundaries config)", () => {
  it("has no directed cycles", async () => {
    const graph = await loadGraph();

    // Verify the graph is non-trivially populated
    const totalEdges = [...graph.values()].reduce((n, s) => n + s.size, 0);
    expect(graph.size).toBeGreaterThan(0);
    expect(totalEdges).toBeGreaterThan(0);

    const cycle = findCycle(graph);
    if (cycle !== null) {
      throw new Error(
        `Cycle detected in folder dependency graph: ${cycle.join(" → ")}`,
      );
    }
  });

  it("every allow entry references a declared element type", async () => {
    const configPath = resolve(
      import.meta.dirname,
      "../../../eslint.config.mjs",
    );
    const configModule = (await import(configPath)) as {
      default: EslintConfig[];
    };
    const configs: EslintConfig[] = configModule.default;

    let elementTypes: Set<string> | undefined;
    let depRules: BoundariesRule[] | undefined;
    for (const block of configs) {
      if (block.settings?.["boundaries/elements"]) {
        elementTypes = new Set(
          block.settings["boundaries/elements"].map((e) => e.type),
        );
      }
      if (block.rules?.["boundaries/dependencies"]) {
        depRules = block.rules["boundaries/dependencies"][1].policies;
      }
    }

    expect(elementTypes).toBeDefined();
    expect(depRules).toBeDefined();

    const unknownRefs: string[] = [];
    for (const rule of depRules ?? []) {
      const fromType = rule.from?.element?.type;
      if (fromType && !elementTypes!.has(fromType)) {
        unknownRefs.push(`from.element.type "${fromType}"`);
      }
      for (const entry of rule.allow ?? []) {
        if (typeof entry !== "object") continue;
        const toType = entry.to?.element?.type;
        if (toType && !elementTypes!.has(toType)) {
          unknownRefs.push(`to.element.type "${toType}"`);
        }
      }
    }

    expect(unknownRefs).toEqual([]);
  });
});
