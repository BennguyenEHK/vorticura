import { describe, it, expect } from 'vitest';
import { cleanHtmlToMarkdown, FETCH_MARKDOWN_MAX_CHARS } from '@/lib/services/search/fetch-markdown';

describe('cleanHtmlToMarkdown', () => {
  it('strips nav and script tags', () => {
    const html = '<html><body><nav>menu</nav><main><p>Product price $9.99</p></main><script>alert(1)</script></body></html>';
    const md = cleanHtmlToMarkdown(html);
    expect(md).toContain('Product price');
    expect(md).not.toContain('menu');
    expect(md).not.toContain('alert');
  });
  it('caps output at FETCH_MARKDOWN_MAX_CHARS', () => {
    const html = `<body><p>${'x'.repeat(20000)}</p></body>`;
    const md = cleanHtmlToMarkdown(html);
    expect(md.length).toBeLessThanOrEqual(FETCH_MARKDOWN_MAX_CHARS);
  });
  it('prefers main content over body', () => {
    const html = '<body><aside>sidebar</aside><main><p>main content</p></main></body>';
    const md = cleanHtmlToMarkdown(html);
    expect(md).toContain('main content');
    expect(md).not.toContain('sidebar');
  });
});
