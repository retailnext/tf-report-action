import type { Plan } from "../tfjson/plan.js";
import type { Report } from "../model/report.js";
import type { ModuleGroup } from "../model/module-group.js";
import type { ResourceChange as ModelResourceChange } from "../model/resource.js";
import type { BuildOptions } from "./options.js";
import { buildConfigRefs } from "./config-refs.js";
import { buildResourceChanges, buildDriftChanges } from "./resources.js";
import { buildSummary } from "./summary.js";
import { buildOutputChanges } from "./outputs.js";

/**
 * Builds a Report from a parsed Plan.
 * Orchestrates: buildConfigRefs → buildResourceChanges → buildDriftChanges → buildSummary → buildOutputChanges → group by module.
 */
export function buildReport(plan: Plan, options: BuildOptions = {}): Report {
  const configRefs = buildConfigRefs(plan.configuration);
  const resources = buildResourceChanges(plan, configRefs, options);
  const driftResources = buildDriftChanges(plan, configRefs, options);
  const summary = buildSummary(resources);
  const outputs = buildOutputChanges(plan);

  // Group resources by moduleAddress
  const modules = groupByModule(resources);
  const driftModules = groupByModule(driftResources);

  return {
    toolVersion: plan.terraform_version ?? null,
    formatVersion: plan.format_version,
    timestamp: plan.timestamp ?? null,
    summary,
    modules,
    outputs,
    driftModules,
  };
}

/** Groups resources by moduleAddress, sorted: root first, then alphabetical. */
function groupByModule(resources: ModelResourceChange[]): ModuleGroup[] {
  const moduleMap = new Map<string, ModuleGroup>();

  for (const resource of resources) {
    const moduleAddr = resource.moduleAddress ?? "";
    let group = moduleMap.get(moduleAddr);
    if (!group) {
      group = { moduleAddress: moduleAddr, resources: [], outputs: [] };
      moduleMap.set(moduleAddr, group);
    }
    group.resources.push(resource);
  }

  return [...moduleMap.values()].sort((a, b) => {
    if (a.moduleAddress === "") return -1;
    if (b.moduleAddress === "") return 1;
    return a.moduleAddress.localeCompare(b.moduleAddress);
  });
}
