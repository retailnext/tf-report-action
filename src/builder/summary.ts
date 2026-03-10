import type { ResourceChange } from "../model/resource.js";
import type { Summary } from "../model/summary.js";

/**
 * Builds a summary of resource change counts.
 * No-op and read actions do not count toward the totals.
 */
export function buildSummary(resources: ResourceChange[]): Summary {
  let add = 0;
  let change = 0;
  let destroy = 0;
  let replace = 0;

  for (const r of resources) {
    switch (r.action) {
      case "create":
        add++;
        break;
      case "update":
        change++;
        break;
      case "delete":
        destroy++;
        break;
      case "replace":
        replace++;
        break;
      // no-op, read, forget, open, unknown do not count
    }
  }

  return {
    add,
    change,
    destroy,
    replace,
    total: add + change + destroy + replace,
  };
}
