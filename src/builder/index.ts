import type { Plan } from "../tfjson/plan.js";
import type { Report } from "../model/report.js";
import type { BuildOptions } from "./options.js";
import { buildResourceChanges, buildDriftChanges } from "./resources.js";
import { buildSummary } from "./summary.js";
import { buildOutputChanges } from "./outputs.js";

/**
 * Builds a Report from a parsed Plan (show-plan JSON). This is the Tier 1
 * path — the richest data source with full attribute detail.
 *
 * Orchestrates: buildResourceChanges → buildDriftChanges →
 * buildSummary → buildOutputChanges.
 */
export function buildReport(plan: Plan, options: BuildOptions = {}): Report {
  const resources = buildResourceChanges(plan, options);
  const driftResources = buildDriftChanges(plan, options);
  const summary = buildSummary(resources);
  const outputs = buildOutputChanges(plan);

  return {
    title: "",
    issues: [],
    steps: [],
    warnings: [],
    rawStdout: [],
    operation: "plan",
    ...(plan.terraform_version !== undefined
      ? { toolVersion: plan.terraform_version }
      : {}),
    formatVersion: plan.format_version,
    ...(plan.timestamp !== undefined ? { timestamp: plan.timestamp } : {}),
    summary,
    resources,
    outputs,
    driftResources,
  };
}
