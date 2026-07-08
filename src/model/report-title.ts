/**
 * Structured report title — preserves all semantic data so that the
 * element layer can render format-appropriate output (markdown, HTML,
 * or plain text for `<title>` tags and PR titles).
 *
 * Built by `buildTitle()` in the builder layer; consumed by
 * `TitleElement` in the element layer.
 */

// ---------------------------------------------------------------------------
// Operation
// ---------------------------------------------------------------------------

/** The IaC operation type — plan, apply, or destroy. */
export type TitleOperation = "plan" | "apply" | "destroy";

// ---------------------------------------------------------------------------
// Action count
// ---------------------------------------------------------------------------

/** A single action count in a title (e.g. "3 to add"). */
export interface TitleActionCount {
  /** The plan/apply action (e.g. "create", "update", "delete"). */
  readonly action: string;
  /** How many resources have this action. */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Title body (discriminated union)
// ---------------------------------------------------------------------------

/**
 * The body of a report title — one of several shapes depending on what
 * data is available in the report.
 */
export type TitleBody =
  | TitleBodySummary
  | TitleBodyNoChanges
  | TitleBodyError
  | TitleBodyOperationFailed
  | TitleBodyStepFailed
  | TitleBodyGenericFailed
  | TitleBodyOperationSkipped
  | TitleBodyAllSkipped
  | TitleBodySucceeded;

/** Summary with action counts (plan or apply). */
export interface TitleBodySummary {
  readonly kind: "summary";
  readonly operation: TitleOperation;
  /** Successful action counts (e.g. 3 create, 1 update). */
  readonly counts: readonly TitleActionCount[];
  /** Failure counts (apply only). */
  readonly failures: readonly TitleActionCount[];
  /** Total number of failures (sum of failures[].count). */
  readonly failureTotal: number;
  /**
   * Number of changed output values (create/update/delete). Rendered as a
   * trailing "N output change(s)" part so the title reflects output-only
   * plans/applies instead of falsely reading "No Changes".
   */
  readonly outputChanges: number;
  /**
   * Whether any step failed (used for icon determination when
   * failures[] comes from non-summary sources like step outcomes).
   */
  readonly hasStepFailure: boolean;
}

/** Plan with zero action counts and no failures. */
export interface TitleBodyNoChanges {
  readonly kind: "no-changes";
}

/** Pipeline/parse error. */
export interface TitleBodyError {
  readonly kind: "error";
}

/** An IaC operation (plan/apply/destroy) failed. */
export interface TitleBodyOperationFailed {
  readonly kind: "operation-failed";
  readonly operation: TitleOperation;
}

/** A single non-IaC step failed (shown by step ID). */
export interface TitleBodyStepFailed {
  readonly kind: "step-failed";
  readonly stepId: string;
}

/** Multiple or unknown steps failed — generic failure. */
export interface TitleBodyGenericFailed {
  readonly kind: "generic-failed";
}

/** The primary operation was skipped. */
export interface TitleBodyOperationSkipped {
  readonly kind: "operation-skipped";
  readonly operation?: TitleOperation;
}

/** All steps in the workflow were skipped. */
export interface TitleBodyAllSkipped {
  readonly kind: "all-skipped";
}

/** The operation (or workflow) succeeded. */
export interface TitleBodySucceeded {
  readonly kind: "succeeded";
  readonly operation?: TitleOperation;
}

// ---------------------------------------------------------------------------
// Report title
// ---------------------------------------------------------------------------

/** The overall status — determines the icon. */
export type TitleStatus = "success" | "failure" | "warning";

/**
 * A structured report title that preserves all semantic data.
 *
 * The element layer renders this to markdown (`## ✅ \`ws\` Plan: 3 to add`),
 * HTML (`<h2>✅ <code>ws</code> Plan: 3 to add</h2>`), or plain text
 * (`✅ ws Plan: 3 to add`) depending on the output format.
 */
export interface ReportTitle {
  /** Overall status — determines the icon. */
  readonly status: TitleStatus;
  /** Workspace name (rendered as code-styled in md/html). */
  readonly workspace?: string;
  /** Title body — determines the textual content. */
  readonly body: TitleBody;
}
