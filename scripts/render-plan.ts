#!/usr/bin/env tsx
/**
 * scripts/render-plan.ts
 *
 * Renders a Terraform/OpenTofu plan JSON file to a browser-viewable HTML
 * preview. Writes to /tmp/tf-plan-preview.html and opens it in the default
 * browser (unless --no-open is passed).
 *
 * Usage:
 *   npm run render -- path/to/show-plan.stdout
 *   npm run render -- show-plan.stdout --template summary --title "My PR"
 *   npm run render -- show-plan.stdout --apply apply.stdout --title "PR #42"
 *   npm run render -- --steps path/to/steps.json --workspace myws
 *   cat show-plan.stdout | npm run render --
 *
 * Flags:
 *   --steps <file>              Steps JSON file (uses reportFromSteps)
 *   --apply <file>              Apply JSONL file (renders apply report)
 *   --title <text>              Heading title for the report
 *   --template <default|summary>  Output template (default: "default")
 *   --show-unchanged            Show unchanged attributes
 *   --diff-format <inline|simple> Diff style (default: "inline")
 *   --workspace <name>          Workspace name (for title and dedup marker)
 *   --logs-url <url>            Logs URL for truncation notices
 *   --allowed-dirs <dirs>       Comma-separated allowed directories for file reading
 *   --max-output-length <n>     Maximum output length in characters
 *   --gallery                    Render all fixture steps JSONs into a gallery HTML page
 *   --no-open                   Write the HTML file but do not open a browser
 *   --help                      Show this help text
 */

import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { planToMarkdown, applyToMarkdown, reportFromSteps } from "../src/index.js";
import type { Options, ReportOptions } from "../src/index.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run render -- [plan.json] [options]

Renders a Terraform/OpenTofu plan JSON file to a browser HTML preview.
Reads the plan from the given file path, or from stdin if the path is "-" or omitted.

Options:
  --steps <file>                  Steps JSON file (uses reportFromSteps instead of low-level API)
  --apply <file>                  Apply JSONL file (renders apply report instead of plan)
  --title <text>                  Heading title for the report
  --template <default|summary>    Output template (default: "default")
  --show-unchanged                Show unchanged resource attributes
  --diff-format <inline|simple>   Diff format for attribute changes (default: "inline")
  --workspace <name>              Workspace name for title and dedup marker
  --logs-url <url>                Logs URL for truncation notices (parses into env vars)
  --allowed-dirs <dirs>           Comma-separated allowed directories for file reading
  --max-output-length <n>         Maximum output length in characters
  --gallery                       Render all fixture steps JSONs into a browsable gallery
  --no-open                       Write the HTML file but do not open a browser
  --help                          Show this help text

Examples:
  npm run render -- tests/fixtures/generated/terraform/null-lifecycle/2/show-plan.stdout
  npm run render -- show-plan.stdout --template summary --title "PR #42"
  npm run render -- show-plan.stdout --apply apply.stdout --title "PR #42"
  npm run render -- --steps tests/fixtures/generated/terraform/null-lifecycle/2/steps.json
  npm run render -- --steps steps.json --workspace myws --no-open
  cat show-plan.stdout | npm run render --
`);
  process.exit(0);
}

interface ParsedArgs {
  file: string | null;
  applyFile: string | null;
  stepsFile: string | null;
  gallery: boolean;
  noOpen: boolean;
  options: Options;
  reportOptions: Partial<ReportOptions>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: Options = {};
  const reportOptions: Partial<ReportOptions> = {};
  let file: string | null = null;
  let applyFile: string | null = null;
  let stepsFile: string | null = null;
  let gallery = false;
  let noOpen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--steps":
        stepsFile = argv[++i] ?? null;
        break;
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
      case "--workspace":
        reportOptions.workspace = argv[++i];
        break;
      case "--logs-url": {
        // Parse a GitHub Actions run URL into env vars for the library
        const url = argv[++i];
        if (url) {
          const match = /github\.com\/([^/]+\/[^/]+)\/actions\/runs\/(\d+)(?:\/attempts\/(\d+))?/.exec(url);
          if (match) {
            reportOptions.env = {
              GITHUB_REPOSITORY: match[1],
              GITHUB_RUN_ID: match[2],
              ...(match[3] ? { GITHUB_RUN_ATTEMPT: match[3] } : {}),
            };
          }
        }
        break;
      }
      case "--allowed-dirs":
        reportOptions.allowedDirs = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--max-output-length": {
        const val = parseInt(argv[++i] ?? "", 10);
        if (!isNaN(val)) reportOptions.maxOutputLength = val;
        break;
      }
      case "--no-open":
        noOpen = true;
        break;
      case "--gallery":
        gallery = true;
        break;
      default:
        if (arg && !arg.startsWith("--") && file === null) {
          file = arg;
        }
    }
  }

  return { file, applyFile, stepsFile, gallery, noOpen, options, reportOptions };
}

const { file, applyFile, stepsFile, gallery, noOpen, options, reportOptions } = parseArgs(args);

// ---------------------------------------------------------------------------
// Shared: Build HTML and write to /tmp
// ---------------------------------------------------------------------------

/** Escape a string for safe embedding in a JS template literal inside HTML. */
function escapeForTemplateLiteral(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

async function renderAndWrite(markdown: string, title: string | undefined, suppressOpen: boolean): Promise<void> {
  const escapedMarkdown = escapeForTemplateLiteral(markdown);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title ? title + " — " : ""}Plan Preview</title>
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

  if (!suppressOpen) {
    try {
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      execSync(`${opener} ${outPath}`);
    } catch {
      process.stderr.write(`Could not open browser automatically. Open: file://${outPath}\n`);
    }
  }

  console.log(`Preview written to ${outPath}`);
}

// ---------------------------------------------------------------------------
// Gallery mode (--gallery)
// ---------------------------------------------------------------------------

if (gallery) {
  const { resolve, dirname, join, isAbsolute, relative } = await import("node:path");
  const { readdirSync, statSync } = await import("node:fs");

  const repoRoot = resolve(import.meta.dirname, "..");

  /** Recursively find all *steps*.json files under a directory. */
  function findStepsFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findStepsFiles(full));
      } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name.includes("steps")) {
        results.push(full);
      }
    }
    return results;
  }

  const fixtureDir = join(repoRoot, "tests", "fixtures");
  const allStepsFiles = findStepsFiles(fixtureDir).sort();

  if (allStepsFiles.length === 0) {
    process.stderr.write("No steps JSON files found under tests/fixtures/\n");
    process.exit(1);
  }

  console.log(`Found ${allStepsFiles.length} fixture steps files. Rendering...`);

  // Render each fixture and collect { path, markdown }
  const entries: Array<{ path: string; markdown: string }> = [];
  for (const absPath of allStepsFiles) {
    const relPath = relative(repoRoot, absPath);
    const stepsDir = dirname(absPath);
    let json: string;
    try {
      json = readFileSync(absPath, "utf-8");
    } catch {
      entries.push({ path: relPath, markdown: `> ⚠️ Failed to read ${relPath}` });
      continue;
    }

    json = resolveRelativeFilePaths(json, stepsDir, join, isAbsolute);

    const opts: ReportOptions = {
      ...options,
      ...reportOptions,
      allowedDirs: reportOptions.allowedDirs ?? [stepsDir],
    };

    try {
      const md = reportFromSteps(json, opts);
      entries.push({ path: relPath, markdown: md });
    } catch {
      entries.push({ path: relPath, markdown: `> ⚠️ reportFromSteps threw for ${relPath}` });
    }
  }

  console.log(`Rendered ${entries.length} fixtures. Building gallery HTML...`);

  const galleryDataJson = JSON.stringify(entries.map(e => ({
    path: e.path,
    markdown: e.markdown,
  })));

  const galleryHtml = buildGalleryHtml(galleryDataJson);
  const outPath = "/tmp/tf-plan-gallery.html";

  try {
    await writeFile(outPath, galleryHtml, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error writing gallery HTML: ${msg}\n`);
    process.exit(1);
  }

  if (!noOpen) {
    try {
      const opener =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "start"
            : "xdg-open";
      execSync(`${opener} ${outPath}`);
    } catch {
      process.stderr.write(`Could not open browser automatically. Open: file://${outPath}\n`);
    }
  }

  console.log(`Gallery written to ${outPath} (${entries.length} fixtures)`);
  process.exit(0);
}

function buildGalleryHtml(entriesJson: string): string {
  // Escape for embedding in a <script> tag (not template literal — use a
  // JSON blob assigned to a variable).
  const escapedJson = entriesJson
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--");

  // We embed the data as a JSON string parsed at runtime to avoid any
  // escaping issues with template literals or special characters in markdown.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tf-plan-md Fixture Gallery</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      display: flex; height: 100vh; overflow: hidden;
      color: #1f2328; background: #ffffff;
    }

    /* Sidebar */
    #sidebar {
      width: 360px; min-width: 260px; max-width: 50vw;
      border-right: 1px solid #d0d7de; display: flex; flex-direction: column;
      background: #f6f8fa;
    }
    #sidebar-header {
      padding: 12px; border-bottom: 1px solid #d0d7de;
    }
    #sidebar-header h2 { font-size: 14px; margin-bottom: 8px; color: #57606a; }
    #filter-input {
      width: 100%; padding: 6px 10px; border: 1px solid #d0d7de;
      border-radius: 6px; font-size: 13px; outline: none;
    }
    #filter-input:focus { border-color: #0969da; box-shadow: 0 0 0 3px rgba(9,105,218,0.15); }
    #count-label { font-size: 11px; color: #57606a; margin-top: 6px; display: block; }
    #fixture-list {
      flex: 1; overflow-y: auto; list-style: none;
    }
    #fixture-list li {
      padding: 6px 12px; cursor: pointer; font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      border-bottom: 1px solid #eaeef2; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    #fixture-list li:hover { background: #ddf4ff; }
    #fixture-list li.active { background: #0969da; color: #fff; }
    #fixture-list li.hidden { display: none; }

    /* Main content */
    #main {
      flex: 1; display: flex; flex-direction: column; overflow: hidden;
    }
    #nav-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; border-bottom: 1px solid #d0d7de;
      background: #f6f8fa; flex-shrink: 0;
    }
    #nav-bar button {
      padding: 4px 12px; border: 1px solid #d0d7de; border-radius: 6px;
      background: #fff; cursor: pointer; font-size: 13px;
    }
    #nav-bar button:hover { background: #f3f4f6; }
    #nav-bar button:disabled { opacity: 0.4; cursor: default; }
    #fixture-path {
      flex: 1; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 13px; color: #0969da; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    #position-label { font-size: 12px; color: #57606a; white-space: nowrap; }
    #btn-copy {
      padding: 4px 12px; font-size: 13px; border: 1px solid #d0d7de;
      border-radius: 6px; background: #f6f8fa; cursor: pointer; white-space: nowrap;
    }
    #btn-copy:hover { background: #eaeef2; }
    #btn-copy.copied { background: #dafbe1; border-color: #116329; color: #116329; }
    #content-area {
      flex: 1; overflow-y: auto; padding: 32px;
      max-width: 1012px;
    }

    /* GitHub-flavored markdown styles */
    #content-area h1, #content-area h2, #content-area h3, #content-area h4 {
      margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25;
    }
    #content-area h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
    #content-area h3 { font-size: 1.25em; }
    #content-area h4 { font-size: 1em; }
    #content-area code {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      font-size: 0.85em; background: #afb8c133; padding: 0.2em 0.4em; border-radius: 6px;
    }
    #content-area pre {
      background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
      padding: 16px; overflow: auto;
    }
    #content-area pre code { background: none; padding: 0; font-size: 0.875em; }
    #content-area table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    #content-area th, #content-area td { border: 1px solid #d0d7de; padding: 6px 13px; }
    #content-area th { background: #f6f8fa; font-weight: 600; }
    #content-area tr:nth-child(even) { background: #f6f8fa; }
    #content-area details {
      margin-bottom: 8px; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 12px;
    }
    #content-area summary { cursor: pointer; font-weight: 500; }
    #content-area del {
      color: #cf222e; text-decoration: none; background: #ffebe9;
      padding: 0 2px; border-radius: 2px;
    }
    #content-area ins {
      color: #116329; text-decoration: none; background: #dafbe1;
      padding: 0 2px; border-radius: 2px;
    }
    #content-area p { margin-top: 0; margin-bottom: 16px; }
    #content-area blockquote {
      margin: 0; padding: 0 1em; color: #57606a;
      border-left: 4px solid #d0d7de;
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <div id="sidebar-header">
      <h2>Fixture Gallery</h2>
      <input id="filter-input" type="text" placeholder="Type to filter fixtures…" autocomplete="off" />
      <span id="count-label"></span>
    </div>
    <ul id="fixture-list"></ul>
  </div>
  <div id="main">
    <div id="nav-bar">
      <button id="btn-prev" title="Previous (←)">← Prev</button>
      <button id="btn-next" title="Next (→)">Next →</button>
      <button id="btn-copy" title="Copy markdown to clipboard">📋 Copy Markdown</button>
      <span id="fixture-path"></span>
      <span id="position-label"></span>
    </div>
    <div id="content-area"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
  <script>
  (function() {
    'use strict';

    var entries = JSON.parse('${escapedJson}');

    var filterInput = document.getElementById('filter-input');
    var countLabel = document.getElementById('count-label');
    var fixtureList = document.getElementById('fixture-list');
    var fixturePath = document.getElementById('fixture-path');
    var positionLabel = document.getElementById('position-label');
    var contentArea = document.getElementById('content-area');
    var btnPrev = document.getElementById('btn-prev');
    var btnNext = document.getElementById('btn-next');
    var btnCopy = document.getElementById('btn-copy');

    // Build the visible (filtered) index list
    var visibleIndices = [];
    var currentVisiblePos = 0; // position within visibleIndices

    // Create list items
    var listItems = [];
    for (var i = 0; i < entries.length; i++) {
      var li = document.createElement('li');
      li.textContent = entries[i].path;
      li.dataset.index = String(i);
      li.addEventListener('click', (function(idx) {
        return function() { selectByGlobalIndex(idx); };
      })(i));
      fixtureList.appendChild(li);
      listItems.push(li);
    }

    function applyFilter() {
      var q = filterInput.value.toLowerCase();
      visibleIndices = [];
      for (var i = 0; i < entries.length; i++) {
        var match = !q || entries[i].path.toLowerCase().indexOf(q) !== -1;
        listItems[i].classList.toggle('hidden', !match);
        if (match) visibleIndices.push(i);
      }
      countLabel.textContent = visibleIndices.length + ' of ' + entries.length + ' fixtures';
      // If current selection is no longer visible, jump to first visible
      if (visibleIndices.length > 0) {
        var globalIdx = visibleIndices[currentVisiblePos];
        if (globalIdx === undefined || listItems[globalIdx].classList.contains('hidden')) {
          currentVisiblePos = 0;
          renderCurrent();
        }
      }
    }

    function renderCurrent() {
      // Clear active state
      for (var i = 0; i < listItems.length; i++) {
        listItems[i].classList.remove('active');
      }

      if (visibleIndices.length === 0) {
        fixturePath.textContent = '(no matches)';
        positionLabel.textContent = '';
        contentArea.innerHTML = '<p style="color:#57606a;padding:20px;">No fixtures match the filter.</p>';
        btnPrev.disabled = true;
        btnNext.disabled = true;
        return;
      }

      var globalIdx = visibleIndices[currentVisiblePos];
      var entry = entries[globalIdx];
      listItems[globalIdx].classList.add('active');
      listItems[globalIdx].scrollIntoView({ block: 'nearest' });

      fixturePath.textContent = entry.path;
      positionLabel.textContent = (currentVisiblePos + 1) + ' / ' + visibleIndices.length;

      var html = DOMPurify.sanitize(marked.parse(entry.markdown));
      contentArea.innerHTML = html;
      contentArea.scrollTop = 0;

      btnPrev.disabled = currentVisiblePos === 0;
      btnNext.disabled = currentVisiblePos === visibleIndices.length - 1;
    }

    function selectByGlobalIndex(globalIdx) {
      var pos = visibleIndices.indexOf(globalIdx);
      if (pos === -1) return;
      currentVisiblePos = pos;
      renderCurrent();
    }

    function goPrev() {
      if (currentVisiblePos > 0) {
        currentVisiblePos--;
        renderCurrent();
      }
    }

    function goNext() {
      if (currentVisiblePos < visibleIndices.length - 1) {
        currentVisiblePos++;
        renderCurrent();
      }
    }

    btnPrev.addEventListener('click', goPrev);
    btnNext.addEventListener('click', goNext);

    btnCopy.addEventListener('click', function() {
      if (visibleIndices.length === 0) return;
      var entry = entries[visibleIndices[currentVisiblePos]];
      navigator.clipboard.writeText(entry.markdown).then(function() {
        btnCopy.textContent = '✅ Copied!';
        btnCopy.classList.add('copied');
        setTimeout(function() {
          btnCopy.textContent = '📋 Copy Markdown';
          btnCopy.classList.remove('copied');
        }, 1500);
      });
    });

    filterInput.addEventListener('input', function() {
      applyFilter();
      if (visibleIndices.length > 0) {
        currentVisiblePos = 0;
        renderCurrent();
      }
    });

    // Keyboard navigation: ←/→ when filter is not focused
    document.addEventListener('keydown', function(e) {
      // Let the filter input handle its own keys
      if (document.activeElement === filterInput) {
        // Escape blurs the filter
        if (e.key === 'Escape') {
          filterInput.blur();
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === '/' || e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        // '/' focuses filter (vim-style), Cmd/Ctrl+F also focuses filter
        e.preventDefault();
        filterInput.focus();
        filterInput.select();
      }
    });

    // Initial render
    applyFilter();
    renderCurrent();
  })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Steps mode (--steps)
// ---------------------------------------------------------------------------

if (stepsFile !== null) {
  let stepsJson: string;
  try {
    stepsJson = readFileSync(stepsFile, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error reading steps file: ${msg}\n`);
    process.exit(1);
  }

  const { dirname, resolve, join, isAbsolute } = await import("node:path");

  const stepsOpts: ReportOptions = {
    ...options,
    ...reportOptions,
  };

  // Default allowed-dirs to the directory containing the steps file
  const stepsDir = resolve(dirname(stepsFile));
  if (!stepsOpts.allowedDirs) {
    stepsOpts.allowedDirs = [stepsDir];
  }

  // Resolve relative stdout_file/stderr_file paths against the steps file
  // directory. The reader rejects relative paths for security, so callers
  // that deal with local fixture files must resolve them first.
  stepsJson = resolveRelativeFilePaths(stepsJson, stepsDir, join, isAbsolute);

  const markdown = reportFromSteps(stepsJson, stepsOpts);
  await renderAndWrite(markdown, options.title, noOpen);
  process.exit(0);
}

/**
 * Resolve relative stdout_file/stderr_file paths in a steps JSON string.
 * Paths are resolved against `baseDir`. Absolute paths are left unchanged.
 */
function resolveRelativeFilePaths(
  json: string,
  baseDir: string,
  joinFn: (...segments: string[]) => string,
  isAbsoluteFn: (p: string) => boolean,
): string {
  const steps = JSON.parse(json) as Record<string, { outputs?: Record<string, string> }>;
  for (const stepData of Object.values(steps)) {
    if (stepData.outputs == null) continue;
    for (const key of ["stdout_file", "stderr_file"]) {
      const val = stepData.outputs[key];
      if (typeof val === "string" && val.length > 0 && !isAbsoluteFn(val)) {
        stepData.outputs[key] = joinFn(baseDir, val);
      }
    }
  }
  return JSON.stringify(steps);
}

// ---------------------------------------------------------------------------
// Legacy mode: direct plan JSON / apply JSONL
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

await renderAndWrite(markdown, options.title, noOpen);
