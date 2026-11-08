import fs from 'node:fs';
import os from 'node:os';
import postcss, { type AtRule, type Declaration, type Node, type Rule } from 'postcss';
import postcssNested from 'postcss-nested';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { path } from '@ecopages/file-system/path';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin.ts';
import { expandSuffixNesting, suffixNesting } from '../plugins/suffix-nesting.ts';

/** The real stylesheets of the docs app that write Sass-style suffix nesting, which `postcss-nested` expands there today. */
const docsSource = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), '../../../../../apps/docs/src');
const DOCS_FILES = [
	'styles/components/button.css',
	'components/burger/burger.css',
	'components/error-diagnostics/error-diagnostics.css',
	'components/banner/banner.css',
	'components/header/header.css',
	'components/api-field/api-field.css',
	'pages/404.css',
	'pages/500.css',
];

/** Every rule of `css` as `at-rule prelude | selector` with its declarations and `@apply`s in order, merged per key. */
function flatRules(css: string): Map<string, string[]> {
	const rules = new Map<string, string[]>();
	const context = (container: Node | undefined): string => {
		const parts: string[] = [];
		for (let node = container; node && node.type !== 'root'; node = node.parent as Node | undefined) {
			if (node.type === 'atrule') parts.unshift(`@${(node as AtRule).name} ${(node as AtRule).params}`);
		}
		return parts.join(' ');
	};
	postcss.parse(css).walk((node) => {
		if (node.type === 'rule') {
			const key = `${context(node.parent)} | ${(node as Rule).selectors.map((selector) => selector.trim().replace(/\s+/gu, ' ')).join(', ')}`;
			const entries = rules.get(key) ?? [];
			for (const child of (node as Rule).nodes) {
				if (child.type === 'decl')
					entries.push(`${(child as Declaration).prop}: ${(child as Declaration).value}`);
				if (child.type === 'atrule') entries.push(`@${(child as AtRule).name} ${(child as AtRule).params}`);
			}
			rules.set(key, entries);
		}
	});
	return rules;
}

const withPostcssNested = async (css: string) =>
	(await postcss([postcssNested()]).process(css, { from: undefined })).css;

describe('suffix nesting against postcss-nested, on the stylesheets of the docs app', () => {
	test.each(DOCS_FILES)('%s expands to the same selectors and declarations', async (relative) => {
		const file = path.join(docsSource, relative);
		const source = fs.readFileSync(file, 'utf8');

		const expected = flatRules(await withPostcssNested(source));
		const expandedSource = expandSuffixNesting(source, file);
		const actual = flatRules(await withPostcssNested(expandedSource));

		expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
		for (const [selector, declarations] of expected) expect(actual.get(selector), selector).toEqual(declarations);
		expect([...actual.keys()].some((key) => /--|__|-left|-right/u.test(key))).toBe(true);
	});

	test.each(DOCS_FILES)('%s leaves no suffix nesting for Lightning CSS', (relative) => {
		const file = path.join(docsSource, relative);

		const expanded = expandSuffixNesting(fs.readFileSync(file, 'utf8'), file);

		expect(expanded).not.toMatch(/&[-_]/u);
	});

	describe('through the Processor', () => {
		let rootDir: string;
		beforeAll(() => {
			rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-parity-')));
		});
		afterAll(() => fs.rmSync(rootDir, { recursive: true, force: true }));

		test.each(DOCS_FILES)('%s builds with the plugin and fails without it', async (relative) => {
			const source = fs.readFileSync(path.join(docsSource, relative), 'utf8');
			const file = path.join(rootDir, 'src', relative);
			const build = async (options: LightningCssProcessorPluginConfig) => {
				const plugin = new LightningCssProcessorPlugin({ options: { targets: ['chrome 90'], ...options } });
				plugin.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
				return plugin.transformStylesheet(source, file);
			};

			const { css } = await build({ plugins: [suffixNesting()] });
			await expect(build({})).rejects.toThrow(/Sass-style suffix nesting/u);

			const { css: reference } = await postcss([postcssNested()]).process(source, { from: undefined });
			const classes = [...reference.matchAll(/\.([\w-]+(?:--|__)[\w-]+)/gu)].map((match) => match[1]!);
			expect(classes.length).toBeGreaterThan(0);
			for (const name of new Set(classes)) expect(css, name).toContain(`.${name}`);
		});
	});
});
