// Portions of this file are derived from tfplan2md by oocx
// (https://github.com/oocx/tfplan2md), used under the MIT License.

/**
 * Try to parse content as an OpenTofu/Terraform validate JSON result and format
 * its diagnostics. Returns undefined if the content is not a validate result.
 */

import {
  STATUS_SUCCESS,
  STATUS_FAILURE,
  DIAGNOSTIC_WARNING,
  DIAGNOSTIC_ERROR,
} from "../model/status-icons.js";
import { escapeHtml } from "./jsonl.js";

export function tryFormatValidateOutput(content: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const obj = parsed as Record<string, unknown>;
  if (
    !("valid" in obj) ||
    typeof obj["valid"] !== "boolean" ||
    !("diagnostics" in obj) ||
    !Array.isArray(obj["diagnostics"])
  ) {
    return undefined;
  }

  const valid = obj["valid"];
  const diagnostics = obj["diagnostics"].filter(
    (d): d is Record<string, unknown> =>
      typeof d === "object" && d !== null && !Array.isArray(d),
  );

  let output = "";
  if (valid) {
    output += `${STATUS_SUCCESS} Configuration is valid\n\n`;
  } else {
    output += `${STATUS_FAILURE} Configuration is **invalid**\n\n`;
  }

  if (diagnostics.length > 0) {
    for (const diag of diagnostics) {
      const severity =
        typeof diag["severity"] === "string" ? diag["severity"] : "error";
      const icon =
        severity === "warning" ? DIAGNOSTIC_WARNING : DIAGNOSTIC_ERROR;
      const summary =
        typeof diag["summary"] === "string" ? diag["summary"] : "(unknown)";
      const detail = typeof diag["detail"] === "string" ? diag["detail"] : "";

      output += `${icon} **${escapeHtml(summary)}**\n`;
      if (detail) {
        const detailLines = escapeHtml(detail)
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
        output += `${detailLines}\n`;
      }

      const snippet = diag["snippet"] as Record<string, unknown> | undefined;
      if (snippet && typeof snippet["code"] === "string") {
        const lineInfo =
          typeof snippet["start_line"] === "number"
            ? ` (line ${String(snippet["start_line"])})`
            : "";
        const ctx =
          typeof snippet["context"] === "string"
            ? ` in ${escapeHtml(snippet["context"])}`
            : "";
        output += `> \`${snippet["code"]}\`${ctx}${lineInfo}\n`;
      }
      output += "\n";
    }
  }

  // Add collapsed raw JSON
  output += `<details>\n<summary>Show raw JSON</summary>\n\n\`\`\`json\n${content}\n\`\`\`\n\n</details>`;

  return output;
}
