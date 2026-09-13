import { expect, test } from 'vitest';
import { rewriteWikiLinkUrl, rewriteWikiMarkdownLinks, resolveWikiLinkTarget } from './links';

test('rewrites absolute wiki paths including a leading slash', () => {
	expect(rewriteWikiLinkUrl('/wiki/app/demo.md')).toBe('/wiki/app/demo');
	expect(rewriteWikiLinkUrl('wiki/app/demo')).toBe('/wiki/app/demo');
});

test('rewrites relative links when the current category is known', () => {
	expect(rewriteWikiLinkUrl('./sibling.md', 'app')).toBe('/wiki/app/sibling');
	expect(rewriteWikiLinkUrl('../concept/auth.md', 'app')).toBe('/wiki/concept/auth');
});

test('leaves relative links unchanged without a current category', () => {
	expect(rewriteWikiLinkUrl('./sibling.md')).toBe('./sibling.md');
});

test('extracts a wiki slug from a rewritten href', () => {
	expect(resolveWikiLinkTarget('./sibling.md', 'app')).toBe('app/sibling');
	expect(resolveWikiLinkTarget('https://example.com/wiki/app/demo.md')).toBe(null);
});

test('rewrites markdown link hrefs in a body', () => {
	expect(rewriteWikiMarkdownLinks('See [x](./sibling.md).', 'app')).toBe('See [x](/wiki/app/sibling).');
});
