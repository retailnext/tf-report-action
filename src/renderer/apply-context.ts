import type { Report } from "../model/report.js";
import type { Diagnostic } from "../model/diagnostic.js";

/**
 * Per-resource apply context passed when rendering apply reports.
 * Provides the failure status and any resource-specific diagnostics.
 */
export interface ApplyContext {
  readonly failed: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/** Returns true when the report was produced from an apply run. */
export function isApplyReport(report: Report): boolean {
  return report.operation === "apply" || report.operation === "destroy";
}

/** Builds a Set of resource addresses that failed during apply. */
export function buildFailedSet(report: Report): Set<string> {
  const failed = new Set<string>();
  if (report.applyStatuses) {
    for (const s of report.applyStatuses) {
      if (!s.success) {
        failed.add(s.address);
      }
    }
  }
  return failed;
}

/** Builds a Map of resource address → diagnostics for that resource. */
export function buildDiagnosticMap(report: Report): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  if (report.diagnostics) {
    for (const diag of report.diagnostics) {
      if (diag.address !== undefined) {
        let list = map.get(diag.address);
        if (!list) {
          list = [];
          map.set(diag.address, list);
        }
        list.push(diag);
      }
    }
  }
  return map;
}

/**
 * Extracts diagnostics that are not resource-specific: those without
 * an address, or whose address doesn't match any resource in the report.
 */
export function extractNonResourceDiagnostics(report: Report): Diagnostic[] {
  if (!report.diagnostics) return [];

  const resourceAddresses = new Set(
    (report.resources ?? []).map((r) => r.address),
  );

  return report.diagnostics.filter(
    (d) => d.address === undefined || !resourceAddresses.has(d.address),
  );
}

/** Builds an ApplyContext for a given resource address. */
export function buildApplyContext(
  address: string,
  failedAddresses: Set<string>,
  diagByAddress: Map<string, Diagnostic[]>,
): ApplyContext {
  return {
    failed: failedAddresses.has(address),
    diagnostics: diagByAddress.get(address) ?? [],
  };
}

/**
 * Builds an apply context lookup function for a report.
 *
 * Returns `undefined` for non-apply reports. For apply reports, returns
 * a function that provides the ApplyContext for any resource address.
 */
export function buildApplyContextFn(
  report: Report,
): ((address: string) => ApplyContext) | undefined {
  if (!isApplyReport(report)) return undefined;
  const failedAddresses = buildFailedSet(report);
  const diagByAddress = buildDiagnosticMap(report);
  return (addr: string) =>
    buildApplyContext(addr, failedAddresses, diagByAddress);
}
