import type { AttributeChange } from "../model/attribute.js";
import { suppressDataSourceDrift } from "./rules/data-source.js";
import { suppressEtagOnlyDrift } from "./rules/etag-only.js";
import { suppressGoogleStorageManagedFolderMetaBoring } from "./rules/google-storage-managed-folder.js";

/**
 * A drift suppression rule.
 *
 * Called with the resource type, mode, and the full set of attribute values
 * for the drift entry — including attributes that did not change. Use
 * `before !== after` to distinguish changed attributes from unchanged ones.
 *
 * Returns `true` if the drift should be omitted from the report.
 * Rules are pure predicates with no side effects.
 */
export type DriftRule = (
  type: string,
  mode: string,
  attributes: AttributeChange[],
) => boolean;

/**
 * A registry of drift suppression rules.
 *
 * Rules are evaluated in registration order. The first rule that returns `true`
 * suppresses the drift entry — remaining rules are not evaluated.
 *
 * Use `createDefaultDriftRuleRegistry()` to obtain a registry pre-loaded with
 * all built-in suppression rules.
 */
export class DriftRuleRegistry {
  private readonly rules: DriftRule[] = [];

  /**
   * Registers a drift suppression rule. Returns `this` for chaining.
   */
  register(rule: DriftRule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * Returns `true` if any registered rule indicates this drift entry should be
   * suppressed from the report.
   */
  shouldSuppressDrift(
    type: string,
    mode: string,
    attributes: AttributeChange[],
  ): boolean {
    return this.rules.some((rule) => rule(type, mode, attributes));
  }
}

/**
 * Creates a `DriftRuleRegistry` pre-loaded with all built-in suppression rules:
 *
 * - Data sources (mode="data") are always suppressed.
 * - Resources where the only changed attribute is `etag` are suppressed.
 * - `google_storage_managed_folder` resources where only `metageneration`
 *   and/or `update_time` changed are suppressed.
 */
export function createDefaultDriftRuleRegistry(): DriftRuleRegistry {
  return new DriftRuleRegistry()
    .register(suppressDataSourceDrift)
    .register(suppressEtagOnlyDrift)
    .register(suppressGoogleStorageManagedFolderMetaBoring);
}
