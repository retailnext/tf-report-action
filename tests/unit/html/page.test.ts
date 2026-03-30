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

  it("includes Primer CSS link", () => {
    const html = buildHtmlPage(fragment);
    expect(html).toContain(
      'href="https://unpkg.com/@primer/css/dist/primer.css"',
    );
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
    expect(html).not.toContain("<script>");
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
});
