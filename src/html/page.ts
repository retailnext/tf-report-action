/**
 * Wrap a GitHub-rendered HTML fragment in a self-contained page.
 *
 * The page loads GitHub's Primer CSS from the unpkg CDN for accurate
 * rendering of the `markdown-body` class. The fragment is inserted as-is
 * because it has already been sanitized by GitHub's `/markdown` API.
 */

/**
 * Build a complete HTML page from a pre-rendered HTML fragment.
 *
 * The result is a self-contained page suitable for uploading as a
 * single-file artifact. Users can open it directly in a browser and
 * see the report with GitHub-like styling.
 */
export function buildHtmlPage(htmlFragment: string, title?: string): string {
  const pageTitle = title ?? "TF Report";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <link rel="stylesheet" href="https://unpkg.com/@primer/css/dist/primer.css">
  <style>
    body { max-width: 1012px; margin: 0 auto; padding: 32px; }
    .markdown-body { font-size: 16px; }
  </style>
</head>
<body>
  <div class="markdown-body">${htmlFragment}</div>
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
