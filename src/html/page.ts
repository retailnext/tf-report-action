/**
 * Wrap a GitHub-rendered HTML fragment in a complete, self-contained HTML page.
 *
 * The page embeds all CSS and JavaScript inline — no external CDN requests
 * are needed. The styles approximate GitHub's `.markdown-body` rendering and
 * a small script adds copy-to-clipboard buttons on every `<pre>` code block.
 */

/**
 * GitHub-flavored markdown CSS for standalone HTML pages.
 *
 * All rules are scoped under `.markdown-body` so the same CSS works in
 * the production artifact page and the dev-time gallery (where it is
 * applied to `#content-area.markdown-body`).
 *
 * Exported so that dev-time tools (`scripts/render.ts`) can reuse the same
 * styles for local preview and the fixture gallery.
 */
export const MARKDOWN_CSS = `
  .markdown-body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px; line-height: 1.6; color: #1f2328;
  }
  .markdown-body a { color: #0969da; text-decoration: none; }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25;
  }
  .markdown-body h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  .markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body h4 { font-size: 1em; }
  .markdown-body p { margin-top: 0; margin-bottom: 16px; }
  .markdown-body ul, .markdown-body ol { margin-top: 0; margin-bottom: 16px; padding-left: 2em; }
  .markdown-body li + li { margin-top: 0.25em; }
  .markdown-body hr {
    height: 0.25em; padding: 0; margin: 24px 0;
    background: #d0d7de; border: 0; border-radius: 6px;
  }
  .markdown-body blockquote {
    margin: 0 0 16px; padding: 0 1em;
    color: #57606a; border-left: 4px solid #d0d7de;
  }
  .markdown-body code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: 0.85em; background: #afb8c133; padding: 0.2em 0.4em; border-radius: 6px;
  }
  .markdown-body pre {
    position: relative;
    background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 16px; overflow: auto; margin-bottom: 16px;
  }
  .markdown-body pre code { background: none; padding: 0; font-size: 0.875em; }
  .markdown-body table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
  .markdown-body th, .markdown-body td { border: 1px solid #d0d7de; padding: 6px 13px; }
  .markdown-body th { background: #f6f8fa; font-weight: 600; }
  .markdown-body tr:nth-child(even) { background: #f6f8fa; }
  .markdown-body details {
    margin-bottom: 8px; border: 1px solid #d0d7de; border-radius: 6px;
    padding: 8px 12px;
  }
  .markdown-body summary { cursor: pointer; font-weight: 500; }
  .markdown-body del {
    color: #cf222e; text-decoration: none; background: #ffebe9;
    padding: 0 2px; border-radius: 2px;
  }
  .markdown-body ins {
    color: #116329; text-decoration: none; background: #dafbe1;
    padding: 0 2px; border-radius: 2px;
  }
  .markdown-body img { max-width: 100%; }
  markdown-accessiblity-table { display: block; }
  .copy-btn {
    position: absolute; top: 8px; right: 8px;
    padding: 4px 8px; font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    border: 1px solid #d0d7de; border-radius: 6px;
    background: #f6f8fa; color: #57606a; cursor: pointer;
    opacity: 0; transition: opacity 0.15s;
  }
  pre:hover .copy-btn { opacity: 1; }
  .copy-btn:hover { background: #eaeef2; }
  .copy-btn.copied { background: #dafbe1; border-color: #116329; color: #116329; opacity: 1; }
`;

/**
 * Inline JavaScript that adds a copy-to-clipboard button to every `<pre>`
 * code block on the page.
 *
 * Exported so that dev-time tools can reuse it for local preview.
 */
export const COPY_BUTTON_JS = `
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll("pre").forEach(function(pre) {
      var btn = document.createElement("button");
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", function() {
        var text = pre.textContent || "";
        navigator.clipboard.writeText(text).then(function() {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(function() {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 2000);
        });
      });
      pre.appendChild(btn);
    });
  });
`;

/**
 * Build a complete HTML page from a pre-rendered HTML fragment.
 *
 * The result is a single-file artifact with all CSS and JS embedded inline.
 * Users can open it directly in a browser — no internet access required.
 */
export function buildHtmlPage(htmlFragment: string, title?: string): string {
  const pageTitle = title ?? "TF Report";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    body { max-width: 1012px; margin: 0 auto; padding: 32px; background: #fff; }
    ${MARKDOWN_CSS}
  </style>
</head>
<body>
  <div class="markdown-body">${htmlFragment}</div>
  <script>${COPY_BUTTON_JS}</script>
</body>
</html>
`;
}

/** Escape characters that could break an HTML text node or attribute. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
