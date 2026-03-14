/**
 * Step issue renderer — converts a StepIssue model into a Section.
 *
 * Handles formatting of step failures, diagnostics, stdout/stderr output
 * with truncation indicators and read error warnings.
 */

import type { StepIssue } from "../model/step-issue.js";
import type { Section } from "../model/section.js";
import { formatRawOutput } from "../raw-formatter/index.js";
import { STATUS_FAILURE, DIAGNOSTIC_WARNING } from "../model/status-icons.js";

/**
 * Render a StepIssue as a compositable Section.
 *
 * The full content includes heading, optional diagnostic, stdout/stderr
 * in collapsible details. The compact content is just the heading.
 */
export function renderStepIssue(issue: StepIssue): Section {
  const icon = issue.isFailed ? STATUS_FAILURE : DIAGNOSTIC_WARNING;

  let content = `### ${icon} ${issue.heading}\n\n`;

  if (issue.diagnostic !== undefined) {
    content += `> ${issue.diagnostic}\n\n`;
  }

  if (issue.stdout !== undefined) {
    const displayContent = issue.stdoutTruncated === true
      ? issue.stdout + "\n… (truncated)"
      : issue.stdout;
    const formatted = formatRawOutput(displayContent);
    content += `<details open>\n<summary>stdout</summary>\n\n${formatted}\n\n</details>\n\n`;
  } else if (issue.stdoutError !== undefined) {
    content += `> ${DIAGNOSTIC_WARNING} stdout not available: ${issue.stdoutError}\n\n`;
  }

  if (issue.stderr !== undefined) {
    const displayContent = issue.stderrTruncated === true
      ? issue.stderr + "\n… (truncated)"
      : issue.stderr;
    content += `<details open>\n<summary>stderr</summary>\n\n\`\`\`\n${displayContent}\n\`\`\`\n\n</details>\n\n`;
  } else if (issue.stderrError !== undefined) {
    content += `> ${DIAGNOSTIC_WARNING} stderr not available: ${issue.stderrError}\n\n`;
  }

  if (
    issue.stdout === undefined && issue.stderr === undefined
    && issue.stdoutError === undefined && issue.stderrError === undefined
  ) {
    content += "No output captured.\n\n";
  }

  return {
    id: `issue-${issue.id}`,
    full: content,
    compact: `### ${icon} ${issue.heading}\n\n`,
  };
}
