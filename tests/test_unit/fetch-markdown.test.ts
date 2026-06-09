import assert from 'assert';
import { cleanHtmlToMarkdown, FETCH_MARKDOWN_MAX_CHARS } from '../../lib/services/search/fetch-markdown.js';

console.log('Testing cleanHtmlToMarkdown...');

const html1 = '<html><body><nav>menu</nav><main><p>Product price $9.99</p></main><script>alert(1)</script></body></html>';
const md1 = cleanHtmlToMarkdown(html1);
assert(md1.includes('Product price'), 'should contain product price');
assert(!md1.includes('menu'), 'should strip nav');
assert(!md1.includes('alert'), 'should strip script');
console.log('✓ strips nav and script tags');

const html2 = `<body><p>${'x'.repeat(20000)}</p></body>`;
const md2 = cleanHtmlToMarkdown(html2);
assert(md2.length <= FETCH_MARKDOWN_MAX_CHARS, 'should cap at max chars');
console.log('✓ caps output at FETCH_MARKDOWN_MAX_CHARS');

const html3 = '<body><aside>sidebar</aside><main><p>main content</p></main></body>';
const md3 = cleanHtmlToMarkdown(html3);
assert(md3.includes('main content'), 'should contain main content');
assert(!md3.includes('sidebar'), 'should not contain sidebar');
console.log('✓ prefers main content over body');

console.log('✓ fetch-markdown.test passed');
