import { expect, test } from 'vitest';
import {
	rewriteWikiLinkUrl,
	rewriteWikiMarkdownLinks,
	resolveWikiLinkTarget,
	extractWikiMarkdownLinkHrefs,
} from './links';

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

test('graph links exclude code examples, images, and unused definitions', () => {
	const body = [
		'```md',
		'[example](./missing.md)',
		'```',
		'`[inline](./missing.md)`',
		'![image](./image.md)',
		'[unused]: ./unused.md',
		'',
		'[real](./sibling.md)',
	].join('\n');
	expect(extractWikiMarkdownLinkHrefs(body)).toEqual(['./sibling.md']);
});

test('graph links resolve references and include extensionless wiki URLs', () => {
	const body = '[Full][target] [target][] [target] [absolute](/wiki/app/demo)\n\n[target]: ./sibling.md';
	expect(extractWikiMarkdownLinkHrefs(body)).toEqual([
		'./sibling.md',
		'./sibling.md',
		'./sibling.md',
		'/wiki/app/demo',
	]);
});
