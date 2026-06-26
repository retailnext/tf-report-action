/**
 * Failure-driven causal relevance for failed-step JSON Lines output.
 *
 * When a `plan` or `apply` step fails, its stdout can contain hundreds of
 * `refresh_*` / `apply_*` hook lines for resources unrelated to the actual
 * failure, burying the one or two diagnostics that explain it.
 *
 * This module identifies the actual *concerns* — `error` and `warning`
 * diagnostics, and `*_errored` hooks — derives the resource addresses those
 * concerns are about, and keeps only the lines causally related to them.
 * Lines whose type the scanner positively recognizes (unrelated hooks,
 * `version`, `change_summary`, `outputs`, `log`, non-error/warning diagnostics)
 * that match no concern are dropped. Anything that cannot be classified — a
 * non-JSON line, a line with no `type`, or a message type the scanner does not
 * recognize — is retained (fail-safe), so a new wire-format message carrying
 * failure context is never silently dropped.
 *
 * It does **not** parse JSONL itself. Both passes are driven by the scanner's
 * per-line visitor ({@link ScanVisitor}): the seed collector piggybacks the
 * model-building scan, and the emitter runs in a second streaming scan. Each
 * pass holds only the small seed (and, for the emitter, the kept output), so
 * the full parsed stream is never materialized.
 *
 * @module builder/causal-relevance
 */

import {
  isKnownMessageType,
  lineConcernInfo,
} from "../jsonl-scanner/classify.js";

/** The set of loci that the failure's concerns are about. */
export interface ConcernSeed {
  /** Config-form (instance-key-stripped) addresses concerns are about. */
  readonly seedAddrs: Set<string>;
  /** Whether any error/warning diagnostic or errored hook was present. */
  hasConcern: boolean;
}

/**
 * Strip instance keys (`["x"]`, `[0]`) from every segment of a resource
 * address so that a concern's address and a hook's address for the same
 * resource block compare equal regardless of instance key.
 */
export function configForm(addr: string): string {
  return addr.replace(/\[[^\]]*\]/g, "");
}

function isConcernSeverity(severity: string | undefined): boolean {
  return severity === "error" || severity === "warning";
}

/**
 * A scanner visitor that collects the concern seed from a single pass.
 *
 * Feed `visit` as the `onLine` argument to `scanString` / `scanFile`; after the
 * scan, read {@link ConcernSeedCollector.seed}.
 */
export class ConcernSeedCollector {
  /** The accumulated seed. Populated as lines are visited. */
  readonly seed: ConcernSeed = {
    seedAddrs: new Set<string>(),
    hasConcern: false,
  };

  /** Visit one classified line. Bound so it can be passed directly as a callback. */
  readonly visit = (
    _raw: string,
    obj: Record<string, unknown> | undefined,
    type: string | undefined,
  ): void => {
    if (obj === undefined || type === undefined) return;
    const info = lineConcernInfo(obj, type);

    if (type === "diagnostic") {
      if (!isConcernSeverity(info.severity)) return;
      this.seed.hasConcern = true;
      if (info.address !== undefined) {
        this.seed.seedAddrs.add(configForm(info.address));
      }
      return;
    }

    if (info.isErroredHook) {
      this.seed.hasConcern = true;
      if (info.address !== undefined) {
        this.seed.seedAddrs.add(configForm(info.address));
      }
    }
  };
}

/**
 * A scanner visitor that appends only the raw lines causally relevant to a
 * seeded set of concerns.
 *
 * Feed `visit` as the `onLine` argument to a second `scanString` / `scanFile`
 * pass; afterwards read {@link RelevanceEmitter.output}.
 */
export class RelevanceEmitter {
  private readonly kept: string[] = [];

  constructor(private readonly seed: ConcernSeed) {}

  /** Visit one classified line, keeping its raw text when relevant. */
  readonly visit = (
    raw: string,
    obj: Record<string, unknown> | undefined,
    type: string | undefined,
  ): void => {
    if (this.isRelevant(obj, type)) this.kept.push(raw);
  };

  private isRelevant(
    obj: Record<string, unknown> | undefined,
    type: string | undefined,
  ): boolean {
    // Non-JSON / unclassifiable line — fail-safe retain.
    if (obj === undefined || type === undefined) return true;

    const info = lineConcernInfo(obj, type);

    // Rule 1: the concerns themselves (error/warning diagnostics).
    if (type === "diagnostic" && isConcernSeverity(info.severity)) return true;
    // Rule 2: errored hooks.
    if (info.isErroredHook) return true;
    // Rule 3: a concern is about this line's resource.
    if (
      info.address !== undefined &&
      this.seed.seedAddrs.has(configForm(info.address))
    ) {
      return true;
    }
    // Fail-safe: retain any message type the scanner does not positively
    // recognize — it may be a new type carrying failure context. Only types
    // we know (handled or known-noise) that match no concern are dropped.
    return !isKnownMessageType(type);
  }

  /** The focused output: the kept raw lines joined by newlines. */
  output(): string {
    return this.kept.join("\n");
  }
}
