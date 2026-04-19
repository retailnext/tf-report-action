import type { DriftRuleRegistry } from "../drift-filter/registry.js";

export interface BuildOptions {
  /**
   * When true, include unchanged attributes in the output.
   * Default: false.
   */
  showUnchangedAttributes?: boolean;
  /**
   * Registry of drift suppression rules used by `buildDriftChanges`.
   *
   * Defaults to `createDefaultDriftRuleRegistry()` when not provided.
   * Inject a custom registry in tests or to extend the default rule set.
   */
  driftRuleRegistry?: DriftRuleRegistry;
}
