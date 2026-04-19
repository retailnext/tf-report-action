/**
 * Drift suppression filter — a pluggable, rule-based system for omitting
 * unimportant drift from reports.
 *
 * Rules are registered into a `DriftRuleRegistry`. The registry's
 * `shouldSuppressDrift()` method evaluates registered rules in order and
 * returns `true` as soon as a rule matches and the drift entry should be
 * omitted.
 *
 * Use `createDefaultDriftRuleRegistry()` to obtain a registry that includes
 * all built-in suppression rules.
 */
export {
  DriftRuleRegistry,
  createDefaultDriftRuleRegistry,
  type DriftRule,
} from "./registry.js";
