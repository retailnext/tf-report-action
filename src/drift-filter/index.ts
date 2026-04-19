/**
 * Drift suppression filter — a pluggable, rule-based system for omitting
 * unimportant drift from reports.
 *
 * Rules are registered into a `DriftRuleRegistry`. The registry's
 * `shouldSuppressDrift()` method evaluates all registered rules and returns
 * `true` if the drift entry should be omitted.
 *
 * Use `createDefaultDriftRuleRegistry()` to obtain a registry that includes
 * all built-in suppression rules.
 */
export {
  DriftRuleRegistry,
  createDefaultDriftRuleRegistry,
  type DriftRule,
} from "./registry.js";
