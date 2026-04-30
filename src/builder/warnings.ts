/**
 * Warning Renderables — semantic warning objects constructed by the builder.
 *
 * Each class implements {@link Renderable} and stores only semantic data
 * fields. No strings are synthesized during construction — `render()`
 * produces format-appropriate output using only the class's own fields.
 *
 * The element layer wraps these in blockquote chrome (`> ⚠️ **Warning:** …`).
 */

import type { Renderable, OutputFormat } from "../renderable/types.js";
import type { Tool } from "../model/report.js";
import type { StepRole } from "../model/step-commands.js";
import { expectedCommand } from "../model/step-commands.js";
import { htmlEscape } from "../renderable/html-escape.js";

// ---------------------------------------------------------------------------
// Command rendering helper (pure — uses only its arguments)
// ---------------------------------------------------------------------------

/** Render a CLI command as code-styled text per format. */
function renderCommand(
  tool: Tool | undefined,
  role: StepRole,
  format: OutputFormat,
): string {
  const cmd = expectedCommand(tool, role);
  return format === "markdown"
    ? `\`${cmd}\``
    : `<code>${htmlEscape(cmd)}</code>`;
}

// ---------------------------------------------------------------------------
// Warnings involving tool commands
// ---------------------------------------------------------------------------

/**
 * No show-plan output available — JSONL provided summary/resources
 * but attribute detail is missing.
 */
export class NoShowPlanWarning implements Renderable {
  readonly tool: Tool | undefined;

  constructor(tool: Tool | undefined) {
    this.tool = tool;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const cmd = renderCommand(this.tool, "show-plan", format);
    return `This report was generated without ${cmd} output. Resource attribute details are not available.`;
  }
}

/**
 * No show-plan AND no JSONL — report fell back to raw text.
 */
export class RawTextFallbackWarning implements Renderable {
  readonly tool: Tool | undefined;

  constructor(tool: Tool | undefined) {
    this.tool = tool;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const cmd = renderCommand(this.tool, "show-plan", format);
    return `Report limited because ${cmd} output was not available. Showing raw command output.`;
  }
}

/**
 * State step missing — unresolved "known after apply" attributes.
 */
export class NoStateWarning implements Renderable {
  readonly tool: Tool | undefined;

  constructor(tool: Tool | undefined) {
    this.tool = tool;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const cmd = renderCommand(this.tool, "state", format);
    return `Some attribute values could not be resolved because ${cmd} output was not available. Add a state step after apply to see the actual values.`;
  }
}

// ---------------------------------------------------------------------------
// Warnings involving step IDs
// ---------------------------------------------------------------------------

/**
 * A step's output could not be parsed — falling back to plan-only data.
 */
export class StepOutputParseWarning implements Renderable {
  readonly stepId: string;

  constructor(stepId: string) {
    this.stepId = stepId;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const id =
      format === "markdown"
        ? `\`${this.stepId}\``
        : `<code>${htmlEscape(this.stepId)}</code>`;
    return `Output from step ${id} could not be parsed; using plan data only.`;
  }
}

// ---------------------------------------------------------------------------
// Warnings involving step roles and I/O errors
// ---------------------------------------------------------------------------

/**
 * A step's stdout file could not be read.
 */
export class StepReadErrorWarning implements Renderable {
  readonly role: StepRole;
  readonly error: string;

  constructor(role: StepRole, error: string) {
    this.role = role;
    this.error = error;
  }

  size(format: OutputFormat): number {
    return this.render(format).length;
  }

  render(format: OutputFormat): string {
    const escaped = format === "markdown" ? this.error : htmlEscape(this.error);
    return `${this.role} stdout: ${escaped}`;
  }
}

/**
 * A step's `stdout_file` output key was missing from steps context.
 */
export class StepOutputMissingWarning implements Renderable {
  readonly role: StepRole;

  constructor(role: StepRole) {
    this.role = role;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat): number {
    return this.render("markdown").length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    return `${this.role}: stdout_file output missing in steps`;
  }
}

/**
 * A step's JSONL output could not be scanned at all.
 */
export class StepScanFailureWarning implements Renderable {
  readonly role: StepRole;

  constructor(role: StepRole) {
    this.role = role;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat): number {
    return this.render("markdown").length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    const label = this.role.charAt(0).toUpperCase() + this.role.slice(1);
    return `${label} JSONL file could not be scanned`;
  }
}

// ---------------------------------------------------------------------------
// Warnings involving JSONL scan quality
// ---------------------------------------------------------------------------

/**
 * Some lines in JSONL output could not be parsed as JSON.
 */
export class UnparseableLinesWarning implements Renderable {
  readonly count: number;
  readonly role: StepRole;

  constructor(count: number, role: StepRole) {
    this.count = count;
    this.role = role;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat): number {
    return this.render("markdown").length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    return `${String(this.count)} line(s) in ${this.role} output could not be parsed as JSON`;
  }
}

/**
 * Some lines in JSONL output had unrecognized message types.
 */
export class UnknownMessageTypesWarning implements Renderable {
  readonly count: number;
  readonly role: StepRole;

  constructor(count: number, role: StepRole) {
    this.count = count;
    this.role = role;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size(_format: OutputFormat): number {
    return this.render("markdown").length;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_format: OutputFormat): string {
    return `${String(this.count)} line(s) in ${this.role} output had unrecognized message types`;
  }
}
