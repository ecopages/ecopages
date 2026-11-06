import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { expandSnippetFences, parseSnippetMeta, readSnippet, remarkSnippetInclude } from './snippet-include';

function fixtureRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), 'snippet-'));
	mkdirSync(path.join(root, 'recipe'));
	writeFileSync(
		path.join(root, 'recipe/a.css'),
		['.a {}', '/* #region theme */', '.b {}', '/* #endregion theme */', '.c {}', ''].join('\n'),
	);
	return root;
}

test('reads the whole file without region markers', () => {
	expect(readSnippet({ file: 'recipe/a.css' }, fixtureRoot())).toBe('.a {}\n.b {}\n.c {}');
});

test('reads only the named region', () => {
	expect(readSnippet({ file: 'recipe/a.css', region: 'theme' }, fixtureRoot())).toBe('.b {}');
});

test('throws for a region the file does not have', () => {
	expect(() => readSnippet({ file: 'recipe/a.css', region: 'nope' }, fixtureRoot())).toThrow(/nope/);
});

test('parses file and region from a fence info string', () => {
	expect(parseSnippetMeta('file="x/y.ts" region="r"')).toEqual({ file: 'x/y.ts', region: 'r' });
	expect(parseSnippetMeta('title="x"')).toBeUndefined();
});

test('fills code nodes that name a file and leaves others alone', () => {
	const root = fixtureRoot();
	const tree = {
		type: 'root',
		children: [
			{ type: 'code', meta: 'file="recipe/a.css" region="theme"', value: '' },
			{ type: 'code', meta: null, value: 'keep' },
		],
	};
	remarkSnippetInclude({ root })(tree);
	expect(tree.children.map((node) => node.value)).toEqual(['.b {}', 'keep']);
});

test('expands fences in raw Markdown and skips plain ones', () => {
	const root = fixtureRoot();
	const markdown = ['```css file="recipe/a.css" region="theme"', '```', '', '```ts', 'const a = 1;', '```', ''].join(
		'\n',
	);
	expect(expandSnippetFences(markdown, root)).toBe(
		['```css file="recipe/a.css" region="theme"', '.b {}', '```', '', '```ts', 'const a = 1;', '```', ''].join(
			'\n',
		),
	);
});
