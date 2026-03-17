import type { JsonValue } from "../tfjson/common.js";

/**
 * Raw state resource instance from `state pull`.
 *
 * Each resource block in the raw tfstate has an `instances` array,
 * one entry per instance (count/for_each). Single-instance resources
 * have exactly one entry with no `index_key`.
 */
export interface RawStateInstance {
  readonly index_key?: string | number;
  readonly attributes?: Record<string, JsonValue>;
  /**
   * Sensitive attribute paths as JSON traversal descriptors. Each entry
   * is an array of path segments like `[{"type":"get_attr","value":"content"}]`.
   */
  readonly sensitive_attributes?: readonly (readonly {
    readonly type: string;
    readonly value: string;
  }[])[];
}

/** Raw state resource from `state pull`. */
export interface RawStateResource {
  readonly module?: string;
  readonly mode?: string;
  readonly type: string;
  readonly name: string;
  readonly instances?: readonly RawStateInstance[];
}

/** Raw state output from `state pull`. */
export interface RawStateOutput {
  readonly value?: JsonValue;
  readonly type?: JsonValue;
  readonly sensitive?: boolean;
}

/**
 * Top-level structure of the raw tfstate file produced by `state pull`.
 *
 * This is the storage/backend format, distinct from the `show -json` analysis
 * format. Key differences:
 * - Uses integer `version` (currently 4) instead of string `format_version`
 * - Resources are flat with `instances[]` instead of nested `ValuesModule` trees
 * - Sensitive attributes use JSON traversal path descriptors, not shadow maps
 */
export interface RawState {
  readonly version: number;
  readonly terraform_version?: string;
  readonly serial?: number;
  readonly lineage?: string;
  readonly resources?: readonly RawStateResource[];
  readonly outputs?: Readonly<Record<string, RawStateOutput>>;
}

/**
 * Parses a JSON string produced by `terraform state pull` or
 * `tofu state pull` into a typed RawState object. Throws a descriptive
 * Error if:
 * - The string is not valid JSON (error message will not contain state content)
 * - The `version` field is missing or greater than 4
 *
 * An empty state (e.g. from a workspace with no resources) is valid and
 * will have `resources` as an empty array or undefined.
 */
export function parseState(json: string): RawState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    // Do not include the underlying SyntaxError detail — Node.js 20+ embeds
    // a snippet of the raw input in the message, which may contain sensitive values.
    throw new Error("Failed to parse state JSON: input is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("State JSON must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  const version = obj["version"];
  if (typeof version !== "number") {
    throw new Error("State JSON is missing required field: version");
  }

  if (version > 4) {
    throw new Error(
      `Unsupported state version: ${String(version)} (expected <= 4)`,
    );
  }

  return parsed as RawState;
}
