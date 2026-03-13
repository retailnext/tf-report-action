#!/usr/bin/env tsx
/**
 * scripts/render-plan.ts
 *
 * Renders a Terraform/OpenTofu plan JSON file to a browser-viewable HTML
 * preview. Writes to /tmp/tf-plan-preview.html and opens it in the default
 * browser (unless --no-open is passed).
 *
 * Usage:
 *   npm run render -- path/to/plan.json
 *   npm run render -- path/to/plan.json --template summary --title "My PR"
 *   npm run render -- plan.json --apply apply.jsonl --title "PR #42"
 *   cat plan.json | npm run render --
 *
 * Flags:
 *   --apply <file>              Apply JSONL file (renders apply report)
 *   --title <text>              Heading title for the report
 *   --template <default|summary>  Output template (default: "default")
 *   --show-unchanged            Show unchanged attributes
 *   --diff-format <inline|simple> Diff style (default: "inline")
 *   --no-open                   Write the HTML file but do not open a browser
 *   --help                      Show this help text
 */

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { planToMarkdown, applyToMarkdown } from "../src/index.js";
import type { Options } from "../src/index.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run render -- [plan.json] [options]

Renders a Terraform/OpenTofu plan JSON file to a browser HTML preview.
Reads the plan from the given file path, or from stdin if the path is "-" or omitted.

Options:
  --apply <file>                  Apply JSONL file (renders apply report instead of plan)
  --title <text>                  Heading title for the report
  --template <default|summary>    Output template (default: "default")
  --show-unchanged                Show unchanged resource attributes
  --diff-format <inline|simple>   Diff format for attribute changes (default: "inline")
  --no-open                       Write the HTML file but do not open a browser
  --help                          Show this help text

Examples:
  npm run render -- tests/fixtures/generated/terraform/null-lifecycle/2/plan.json
  npm run render -- plan.json --template summary --title "PR #42"
  npm run render -- plan.json --apply apply.jsonl --title "PR #42"
  cat plan.json | npm run render --
`);
  process.exit(0);
}

function parseArgs(argv: string[]): { file: string | null; applyFile: string | null; noOpen: boolean; options: Options } {
  const options: Options = {};
  let file: string | null = null;
  let applyFile: string | null = null;
  let noOpen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--apply":
        applyFile = argv[++i] ?? null;
        break;
      case "--title":
        options.title = argv[++i];
        break;
      case "--template":
        options.template = argv[++i];
        break;
      case "--show-unchanged":
        options.showUnchangedAttributes = true;
        break;
      case "--diff-format":
        options.diffFormat = argv[++i] as "inline" | "simple";
        break;
      case "--no-open":
        noOpen = true;
        break;
      default:
        if (!arg.startsWith("--") && file === null) {
          file = arg;
        }
    }
  }

  return { file, applyFile, noOpen, options };
}

const { file, applyFile, noOpen, options } = parseArgs(args);

// ---------------------------------------------------------------------------
// Read plan JSON
// ---------------------------------------------------------------------------

let planJson: string;
try {
  if (file === null || file === "-") {
    planJson = readFileSync(process.stdin.fd, "utf-8");
  } else {
    planJson = readFileSync(file, "utf-8");
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error reading input: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Read apply JSONL (if provided)
// ---------------------------------------------------------------------------

let applyJsonl: string | null = null;
if (applyFile !== null) {
  try {
    applyJsonl = readFileSync(applyFile, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error reading apply file: ${msg}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------

let markdown: string;
try {
  if (applyJsonl !== null) {
    markdown = applyToMarkdown(planJson, applyJsonl, options);
  } else {
    markdown = planToMarkdown(planJson, options);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error rendering plan: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build HTML and write to /tmp
// ---------------------------------------------------------------------------

/** Escape a string for safe embedding in a JS template literal inside HTML. */
function escapeForTemplateLiteral(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

const escapedMarkdown = escapeForTemplateLiteral(markdown);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title ? options.title + " — " : ""}Plan Preview</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1f2328;
      background: #ffffff;
      max-width: 1012px;
      margin: 0 auto;
      padding: 32px;
    }
    h1, h2, h3, h4 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 0.85em; background: #afb8c133; padding: 0.2em 0.4em; border-radius: 6px; }
    pre { background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; padding: 16px; overflow: auto; }
    pre code { background: none; padding: 0; font-size: 0.875em; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td { border: 1px solid #d0d7de; padding: 6px 13px; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) { background: #f6f8fa; }
    details { margin-bottom: 8px; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 12px; }
    summary { cursor: pointer; font-weight: 500; }
    del { color: #cf222e; text-decoration: none; background: #ffebe9; padding: 0 2px; border-radius: 2px; }
    ins { color: #116329; text-decoration: none; background: #dafbe1; padding: 0 2px; border-radius: 2px; }
    p { margin-top: 0; margin-bottom: 16px; }
    blockquote { margin: 0; padding: 0 1em; color: #57606a; border-left: 4px solid #d0d7de; }
  </style>
</head>
<body>
  <div id="content"></div>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
  <script>
    const markdown = \`${escapedMarkdown}\`;
    const html = DOMPurify.sanitize(marked.parse(markdown));
    document.getElementById('content').innerHTML = html;
  </script>
</body>
</html>`;

const outPath = "/tmp/tf-plan-preview.html";

try {
  await writeFile(outPath, html, "utf-8");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error writing HTML file: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Open in browser (suppressed by --no-open)
// ---------------------------------------------------------------------------

if (!noOpen) {
  try {
    // macOS: open, Linux: xdg-open, Windows: start
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    execSync(`${opener} ${outPath}`);
  } catch {
    // Opening the browser is best-effort; tell the user the path instead
    process.stderr.write(`Could not open browser automatically. Open: file://${outPath}\n`);
  }
}

console.log(`Preview written to ${outPath}`);
