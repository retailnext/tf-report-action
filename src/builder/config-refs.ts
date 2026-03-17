import type { Config, ConfigModule } from "../tfjson/config.js";
import type { ConfigExpression } from "../tfjson/common.js";

/** Maps (resourceAddress, attributeName) to a list of reference strings. */
export type ConfigRefIndex = Map<string, Map<string, string[]>>;

/**
 * Builds an index of attribute → reference expressions from plan.configuration.
 * Used to show "known after apply: <reference>" labels.
 */
export function buildConfigRefs(
  config: Config | undefined | null,
): ConfigRefIndex {
  const index: ConfigRefIndex = new Map();
  if (!config) return index;

  walkModule(config.root_module, index);
  return index;
}

function walkModule(
  module: ConfigModule | undefined,
  index: ConfigRefIndex,
): void {
  if (!module) return;

  for (const resource of module.resources ?? []) {
    const address = resource.address;
    if (!address) continue;

    const expressions = resource.expressions;
    if (!expressions) continue;

    const attrRefs = new Map<string, string[]>();
    for (const [attrName, expr] of Object.entries(expressions)) {
      const refs = collectRefs(expr);
      if (refs.length > 0) {
        attrRefs.set(attrName, refs);
      }
    }
    if (attrRefs.size > 0) {
      index.set(address, attrRefs);
    }
  }

  for (const moduleCall of Object.values(module.module_calls ?? {})) {
    walkModule(moduleCall.module, index);
  }
}

function collectRefs(expr: ConfigExpression): string[] {
  if (Array.isArray(expr)) {
    const refs: string[] = [];
    for (const item of expr) {
      refs.push(...collectRefs(item as ConfigExpression));
    }
    return refs;
  }

  if (typeof expr === "object") {
    // Check if it looks like an Expression (has references field)
    const asExpr = expr as { references?: string[]; constant_value?: unknown };
    if (asExpr.references !== undefined) {
      return asExpr.references.filter(
        (r): r is string => typeof r === "string",
      );
    }
    // It's a nested block — recurse into its values
    const refs: string[] = [];
    for (const val of Object.values(expr)) {
      refs.push(...collectRefs(val as ConfigExpression));
    }
    return refs;
  }

  return [];
}
