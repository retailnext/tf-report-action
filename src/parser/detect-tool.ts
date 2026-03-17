/**
 * Tool detection — infers the IaC tool (terraform or tofu) from available output.
 *
 * Two entry points:
 * - `detectToolFromPlan` — uses plan-JSON-specific fields (`timestamp`, `applyable`)
 * - `detectToolFromOutput` — heuristic scan of raw step output (JSONL version
 *   message first, then raw text patterns)
 *
 * Returns `undefined` when the tool cannot be determined.
 */

import type { Plan } from "../tfjson/plan.js";
import type { Tool } from "../model/report.js";

/**
 * Detect the IaC tool from a parsed Plan object.
 *
 * Uses tool-specific fields documented in `tfjson/plan.ts`:
 * - `applyable` present → Terraform (`"terraform"`) — this field is Terraform-only
 * - `timestamp` present (without `applyable`) → OpenTofu (`"tofu"`)
 * - Falls back to inspecting the `terraform_version` string for "tofu"
 *
 * Note: `applyable` is checked first because Terraform 1.14+ emits both
 * `applyable` and `timestamp`, while OpenTofu emits only `timestamp`.
 */
export function detectToolFromPlan(plan: Plan): Tool | undefined {
  // Terraform-only field — checked first because Terraform 1.14+ also
  // emits timestamp, making that field ambiguous.
  if (plan.applyable !== undefined) return "terraform";

  // OpenTofu-only when applyable is absent
  if (plan.timestamp !== undefined) return "tofu";

  // Heuristic: OpenTofu uses the `terraform_version` key but the value
  // is an OpenTofu version string (the tool name is NOT in the string,
  // but some builds include it). This is a last-resort check.
  const version = plan.terraform_version;
  if (version !== undefined) {
    const lower = version.toLowerCase();
    if (lower.includes("tofu")) return "tofu";
  }

  return undefined;
}

/**
 * Detect the IaC tool from raw step output content.
 *
 * Strategies (in priority order):
 * 1. **JSONL version message**: first few lines are scanned for a JSON object
 *    with `type: "version"` — if it has a `tofu` field → `"tofu"`, a
 *    `terraform` field → `"terraform"`.
 * 2. **Raw text patterns**: the first 4 KiB is searched (case-insensitively)
 *    for `"opentofu"` or `"terraform"`.
 */
export function detectToolFromOutput(
  content: string | undefined,
): Tool | undefined {
  if (content === undefined || content.length === 0) return undefined;

  // Strategy 1: JSONL version message
  const versionResult = detectFromVersionMessage(content);
  if (versionResult !== undefined) return versionResult;

  // Strategy 2: Raw text patterns
  return detectFromRawText(content);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look for a JSONL version message in the first few lines.
 *
 * The version message is always the first message emitted by both
 * `terraform` and `tofu` when running with `-json`. It has `type: "version"`
 * and a tool-specific field (`tofu` or `terraform`).
 */
function detectFromVersionMessage(content: string): Tool | undefined {
  // Only scan the first few lines to avoid parsing the entire output
  const lines = content.split("\n", 5);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      continue;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      continue;
    }

    const obj = parsed as Record<string, unknown>;
    if (obj["type"] !== "version") continue;

    if ("tofu" in obj) return "tofu";
    if ("terraform" in obj) return "terraform";
  }
  return undefined;
}

/** Look for tool name patterns in the first portion of raw text. */
function detectFromRawText(content: string): Tool | undefined {
  const sample = content.slice(0, 4096).toLowerCase();

  // Check for OpenTofu first — "opentofu" is unambiguous.
  // Plain "tofu" could appear in other contexts, so we only check "opentofu".
  if (sample.includes("opentofu")) return "tofu";

  // "Terraform" at the start of a line is the human-readable version banner.
  if (sample.includes("terraform")) return "terraform";

  return undefined;
}
