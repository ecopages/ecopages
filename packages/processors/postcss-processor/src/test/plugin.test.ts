import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import type postcss from 'postcss';
import postcssNested from 'postcss-nested';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { PostCssProcessorPlugin } from '../plugin';

let tmpDir: string;
let srcDir: string;

/** A plugin that sets every `color` to the value `color()` returned when the plugin was created. */
function colorPlugin(name: string, color: () => string): postcss.AcceptedPlugin {
	const colorAtCreation = color();
	return {
		postcssPlugin: name,
		Declaration(decl) {
			if (decl.prop === 'color') decl.value = colorAtCreation;
		},
	} as postcss.AcceptedPlugin;
}

async function setUp(plugin: PostCssProcessorPlugin): Promise<void> {
	const config = await finalizeEcoPagesConfig({ rootDir: tmpDir, srcDir: 'src', distDir: 'dist' });
	plugin.setContext(config);
	await plugin.setup();
}

describe('PostCssProcessorPlugin', () => {
	beforeEach(() => {
		tmpDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'postcss-plugin-test-')));
		srcDir = path.join(tmpDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test('applies transformInput before PostCSS', async () => {
		const cssFile = path.join(srcDir, 'direct-process.css');
		const plugin = new PostCssProcessorPlugin({
			options: { transformInput: async (content) => `/* direct */\n${content}` },
		});
		await setUp(plugin);

		const { css } = await plugin.transformStylesheet('.foo { color: red; }', cssFile);

		expect(css).toContain('/* direct */');
		expect(css).toContain('.foo { color: red; }');
	});

	test('uses the configured plugins first and fresh factory instances after a content change', async () => {
		const cssFile = path.join(srcDir, 'factory-precedence.css');
		let refreshedColor = 'blue';
		const plugin = new PostCssProcessorPlugin({
			options: {
				plugins: { initial: colorPlugin('initial', () => 'green') },
				pluginFactories: { refreshed: () => colorPlugin('refreshed', () => refreshedColor) },
			},
		});
		await setUp(plugin);
		expect((await plugin.transformStylesheet('.foo { color: red; }', cssFile)).css).toContain('color: green');

		refreshedColor = 'purple';
		expect(plugin.invalidateStylesheets([path.join(srcDir, 'component.tsx')])).toEqual([]);

		expect((await plugin.transformStylesheet('.foo { color: red; }', cssFile)).css).toContain('color: purple');
	});

	test('invalidates only the stylesheets whose reported content sources match a changed file', async () => {
		const scanner = (name: string, dir: string, glob: string): postcss.AcceptedPlugin =>
			({
				postcssPlugin: name,
				Once(_root, { result }) {
					result.messages.push({ type: 'dir-dependency', plugin: '@tailwindcss/postcss', dir, glob });
				},
			}) as postcss.AcceptedPlugin;
		const pagesDir = path.join(srcDir, 'pages');
		const docsDir = path.join(srcDir, 'docs');
		const plugin = new PostCssProcessorPlugin({
			options: { plugins: { scan: scanner('scan', pagesDir, '**/*.tsx') } },
		});
		await setUp(plugin);
		const pagesCss = path.join(srcDir, 'pages.css');
		await plugin.transformStylesheet('.a { color: red; }', pagesCss);
		const other = new PostCssProcessorPlugin({
			options: { plugins: { scan: scanner('scan', docsDir, '*.md') } },
		});
		await setUp(other);
		const docsCss = path.join(srcDir, 'docs.css');
		await other.transformStylesheet('.a { color: red; }', docsCss);

		expect(plugin.invalidateStylesheets([path.join(pagesDir, 'deep/home.tsx')])).toEqual([pagesCss]);
		expect(
			plugin.invalidateStylesheets([path.join(pagesDir, 'data.json'), path.join(tmpDir, 'pnpm-lock.yaml')]),
		).toEqual([]);
		expect(other.invalidateStylesheets([path.join(docsDir, 'post.md')])).toEqual([docsCss]);
		expect(other.invalidateStylesheets([path.join(docsDir, 'nested/post.md')])).toEqual([]);
	});

	test('loads the configured plugins on the first transform instead of at finalization', async () => {
		const cssFile = path.join(srcDir, 'lazy-plugins.css');
		const createPlugin = vi.fn(() => colorPlugin('lazy', () => 'green'));
		const plugin = new PostCssProcessorPlugin({ options: { pluginFactories: { lazy: createPlugin } } });
		const appConfig = await finalizeEcoPagesConfig({
			rootDir: tmpDir,
			srcDir: 'src',
			distDir: 'dist',
			processors: [plugin],
		});
		plugin.setContext(appConfig);

		expect(createPlugin).not.toHaveBeenCalled();

		const [first, second] = await Promise.all([
			plugin.transformStylesheet('.foo { color: red; }', cssFile),
			plugin.transformStylesheet('.foo { color: red; }', cssFile),
		]);

		expect(first.css).toContain('color: green');
		expect(second.css).toContain('color: green');
		expect(createPlugin).toHaveBeenCalledTimes(1);
	});

	test('preserves BEM selectors with nesting plugins', async () => {
		const cssFile = path.join(srcDir, 'pages', 'api-lab.css');
		const plugin = new PostCssProcessorPlugin({ options: { plugins: { 'postcss-nested': postcssNested() } } });
		await setUp(plugin);

		const { css } = await plugin.transformStylesheet(
			['.api-lab {', '\t&__workspace-grid {', '\t\tdisplay: grid;', '\t}', '}'].join('\n'),
			cssFile,
		);

		expect(css).toContain('.api-lab__workspace-grid');
		expect(css).not.toContain('__workspace-grid.api-lab');
		expect(css).toContain('display: grid');
	});

	test('declares .css only, so it claims no Sass or Less file', () => {
		const plugin = new PostCssProcessorPlugin({ options: { filter: /\.css$/ } });

		expect(plugin.getAssetCapabilities().map((capability) => capability.extensions)).toEqual([['*.css']]);
		expect(plugin.canProcessAsset('stylesheet', path.join(srcDir, 'page.css'))).toBe(true);
		expect(plugin.canProcessAsset('stylesheet', path.join(srcDir, 'theme.scss'))).toBe(false);
		expect(plugin.canProcessAsset('stylesheet', path.join(srcDir, 'theme.less'))).toBe(false);
	});
});
