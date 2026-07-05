import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';
import { compile, run } from '@mdx-js/mdx';
import type { MDXComponents } from 'mdx/types.js';
import { VFile } from 'vfile';
import { Fragment, jsx, jsxs } from '@ecopages/jsx/jsx-runtime';
import { renderToString } from '@ecopages/jsx/server';
import { getDocsMdxCompileOptions } from './mdx-plugin-chain';
import { clearCompileDocsMdxCache, compileDocsMdx } from './compile-mdx';
import { getDocsMdxComponents } from './mdx-scope';

const INTRODUCTION_PATH = join(import.meta.dirname, '../../../content/docs/getting-started/introduction.mdx');

beforeAll(() => {
	clearCompileDocsMdxCache();
});

test('compileDocsMdx renders Banner JSX via runtime scope injection', async () => {
	const source = readFileSync(INTRODUCTION_PATH, 'utf8');
	const compiled = await compileDocsMdx({ source, filePath: INTRODUCTION_PATH });
	const html = await renderToString(await compiled.default({}));

	expect(html).toMatch(/eco-banner/);
	expect(html).toMatch(/Welcome to Ecopages/);
	expect(html).not.toMatch(/import \{ DocsLayout \}/);
});

test('compileDocsMdx uses mtime cache', async () => {
	const source = readFileSync(INTRODUCTION_PATH, 'utf8');
	const first = await compileDocsMdx({ source, filePath: INTRODUCTION_PATH });
	const second = await compileDocsMdx({ source, filePath: INTRODUCTION_PATH });

	expect(first.default).toBe(second.default);
});

test('getDocsMdxCompileOptions produces GFM markdown output', async () => {
	const compiled = await compile('# Hello\n\n**world**', getDocsMdxCompileOptions());
	const mod = await run(compiled, { Fragment, jsx, jsxs, baseUrl: import.meta.url });
	const html = await renderToString(await mod.default({}));

	expect(html).toMatch(/<h1>Hello<\/h1>/);
	expect(html).toMatch(/<strong>world<\/strong>/);
});

test('getDocsMdxComponents provides Banner for MDX components prop', async () => {
	const source = readFileSync(INTRODUCTION_PATH, 'utf8');
	const compiled = await compile(
		new VFile({
			value: source,
			path: INTRODUCTION_PATH,
		}),
		getDocsMdxCompileOptions(),
	);
	const mod = await run(compiled, {
		Fragment,
		jsx,
		jsxs,
		baseUrl: new URL(`file://${INTRODUCTION_PATH}`).href,
	});
	const html = await renderToString(await mod.default({ components: getDocsMdxComponents() as MDXComponents }));

	expect(html).toMatch(/eco-banner/);
});
