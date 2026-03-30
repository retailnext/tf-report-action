import { describe, expect, it } from "vitest";
import { buildHtmlPage } from "../../../src/html/page.js";

describe("buildHtmlPage", () => {
  const fragment = "<h1>Plan Report</h1><p>3 to add, 1 to change</p>";

  it("produces a valid HTML5 document", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it("wraps the fragment in a markdown-body div", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain(`<div class="markdown-body">${fragment}</div>`);
  });

  it("embeds CSS inline (no external CDN links)", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("<style>");
    expect(html).toContain(".markdown-body");
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it("includes copy-button JavaScript", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("<script>");
    expect(html).toContain("copy-btn");
    expect(html).toContain("navigator.clipboard");
  });

  it("uses default title when omitted", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("<title>TF Report</title>");
  });

  it("uses custom title when provided", () => {
    const html = buildHtmlPage(fragment, "Cluster Plan");
    expect(html).toContain("<title>Cluster Plan</title>");
  });

  it("escapes special characters in the title", () => {
    const html = buildHtmlPage(fragment, 'Test <script>"alert"</script>');
    expect(html).toContain(
      "<title>Test &lt;script&gt;&quot;alert&quot;&lt;/script&gt;</title>",
    );
    expect(html).not.toContain("<script>alert");
  });

  it("inserts fragment verbatim", () => {
    const richFragment =
      '<pre><code class="language-diff">+ resource "aws_s3_bucket"</code></pre>';
    const html = buildHtmlPage(richFragment);
    expect(html).toContain(richFragment);
  });

  it("includes viewport meta tag", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
  });

  it("styles tables with borders", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("border-collapse: collapse");
    expect(html).toContain("border: 1px solid");
  });

  it("styles details/summary elements", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain(".markdown-body details");
    expect(html).toContain(".markdown-body summary");
  });

  it("handles markdown-accessiblity-table custom element", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain("markdown-accessiblity-table");
    expect(html).toContain("display: block");
  });
});
