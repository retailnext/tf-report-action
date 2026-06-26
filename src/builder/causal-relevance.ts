/**
 * Failure-driven causal relevance filtering for failed-step JSON Lines output.
 *
 * When a `plan` or `apply` step fails, its full JSONL stdout is attached to a
 * `StepIssue`. That stdout can contain hundreds of `refresh_*` / `apply_*` hook
 * lines for resources unrelated to the actual failure, burying the one or two
 * diagnostics that explain it.
 *
 * This module identifies the actual *concerns* in the output — `error` and
 * `warning` diagnostics, and `*_errored` hooks — derives the resource
 * addresses those concerns are about, and keeps only the lines causally
 * related to those addresses. Everything positively classified as unrelated
 * (unrelated hooks, `version`, `change_summary`, `outputs`, `log`, and
 * non-error/warning diagnostics that match no concern) is dropped. Anything
 * that cannot be classified is retained (fail-safe).
 *
 * The classifier operates on the raw JSONL text rather than the scanned model,
 * because the scanner narrows the data (it discards non-error/warning
 * diagnostics and does not capture `provision_errored` hooks) — information the
 * relevance decision needs.
 */

/** The set of loci that the failure's concerns are about. */
export interface ConcernSeed {
  /** Config-form (instance-key-stripped) addresses concerns are about. */
  seedAddrs: Set<string>;
  /** Whether any error/warning diagnostic or errored hook was present. */
  hasConcern: boolean;
}

const ERRORED_HOOK_TYPES = new Set(["apply_errored", "provision_errored"]);

const ADDRESSED_HOOK_TYPES = new Set([
  "apply_start",
  "apply_progress",
  "apply_complete",
  "apply_errored",
  "refresh_start",
  "refresh_complete",
  "provision_start",
  "provision_progress",
  "provision_complete",
  "provision_errored",
]);

/**
 * Strip instance keys (`["x"]`, `[0]`) from every segment of a resource
 * address so that a concern's address and a hook's address for the same
 * resource block compare equal regardless of instance key.
 */
export function configForm(addr: string): string {
  return addr.replace(/\[[^\]]*\]/g, "");
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function parseLine(line: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
  return asObject(parsed);
}

/** The resource address carried by a hook / planned_change / diagnostic line. */
function lineAddress(obj: Record<string, unknown>): string | undefined {
  const type = obj["type"];
  if (typeof type !== "string") return undefined;

  if (ADDRESSED_HOOK_TYPES.has(type)) {
    const hook = asObject(obj["hook"]);
    const resource = hook && asObject(hook["resource"]);
    const addr = resource?.["addr"];
    return typeof addr === "string" ? addr : undefined;
  }

  if (type === "planned_change" || type === "resource_drift") {
    const change = asObject(obj["change"]);
    const resource = change && asObject(change["resource"]);
    const addr = resource?.["addr"];
    return typeof addr === "string" ? addr : undefined;
  }

  if (type === "diagnostic") {
    const diagnostic = asObject(obj["diagnostic"]);
    const addr = diagnostic?.["address"];
    return typeof addr === "string" ? addr : undefined;
  }

  return undefined;
}

/** Severity of a diagnostic line, or undefined if the line is not a diagnostic. */
function diagnosticSeverity(obj: Record<string, unknown>): string | undefined {
  if (obj["type"] !== "diagnostic") return undefined;
  const diagnostic = asObject(obj["diagnostic"]);
  const severity = diagnostic?.["severity"];
  return typeof severity === "string" ? severity : undefined;
}

function isConcernDiagnostic(severity: string | undefined): boolean {
  return severity === "error" || severity === "warning";
}

/**
 * First pass: collect the addresses that the failure's concerns
 * (error/warning diagnostics and `*_errored` hooks) are about.
 */
export function buildConcernSeed(content: string): ConcernSeed {
  const seedAddrs = new Set<string>();
  let hasConcern = false;

  for (const line of content.split("\n")) {
    if (line.trim() === "") continue;
    const obj = parseLine(line);
    if (obj === undefined) continue;
    const type = obj["type"];
    if (typeof type !== "string") continue;

    if (type === "diagnostic") {
      if (!isConcernDiagnostic(diagnosticSeverity(obj))) continue;
      hasConcern = true;
      const addr = lineAddress(obj);
      if (addr !== undefined) seedAddrs.add(configForm(addr));
      continue;
    }

    if (ERRORED_HOOK_TYPES.has(type)) {
      hasConcern = true;
      const addr = lineAddress(obj);
      if (addr !== undefined) seedAddrs.add(configForm(addr));
    }
  }

  return { seedAddrs, hasConcern };
}

/** Whether a single line is causally relevant to the seeded concerns. */
function isRelevant(line: string, seed: ConcernSeed): boolean {
  const obj = parseLine(line);
  if (obj === undefined) return true; // non-JSON / unclassifiable — fail-safe
  const type = obj["type"];
  if (typeof type !== "string") return true; // no type — fail-safe

  // Rule 1: the concerns themselves.
  if (type === "diagnostic" && isConcernDiagnostic(diagnosticSeverity(obj))) {
    return true;
  }
  // Rule 2: errored hooks.
  if (ERRORED_HOOK_TYPES.has(type)) return true;

  // Rule 3: a concern is about this line's resource.
  const addr = lineAddress(obj);
  if (addr !== undefined && seed.seedAddrs.has(configForm(addr))) return true;

  return false;
}

/**
 * Filter JSON Lines content to only the lines causally relevant to the
 * failure's concerns. When there is no concern (no error/warning diagnostic and
 * no errored hook), the content is returned unchanged — there is nothing to
 * scope to, so everything is kept.
 *
 * Blank lines are preserved.
 */
export function filterJsonlByConcernRelevance(content: string): string {
  const seed = buildConcernSeed(content);
  if (!seed.hasConcern) return content;

  const kept: string[] = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "" || isRelevant(line, seed)) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}
