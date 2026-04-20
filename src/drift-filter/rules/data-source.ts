import type { DriftRule } from "../registry.js";

/**
 * Suppresses drift for data sources.
 *
 * Data sources are read-only and managed externally — drift in a data source
 * is always expected and never actionable. Errors relating to data sources
 * surface through the diagnostics section instead.
 */
export const suppressDataSourceDrift: DriftRule = (
  _type: string,
  mode: string,
): boolean => mode === "data";
