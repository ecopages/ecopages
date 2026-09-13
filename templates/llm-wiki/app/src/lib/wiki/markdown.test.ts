import { expect, test } from 'vitest';
import { matchWikiMarkdownPath, wikiMarkdownAlternatePath } from './markdown';

test('matchWikiMarkdownPath accepts category/page slugs', () => {
	expect(matchWikiMarkdownPath('/wiki/app/demo')).toEqual({ slug: 'app/demo', forceMarkdown: false });
	expect(matchWikiMarkdownPath('/wiki/app/demo.md')).toEqual({ slug: 'app/demo', forceMarkdown: true });
	expect(matchWikiMarkdownPath('/wiki/demo')).toEqual({ slug: 'demo', forceMarkdown: false });
	expect(matchWikiMarkdownPath('/')).toBeNull();
});

test('wikiMarkdownAlternatePath keeps the category/page slug', () => {
	expect(wikiMarkdownAlternatePath('app/demo')).toBe('/wiki/app/demo.md');
});
