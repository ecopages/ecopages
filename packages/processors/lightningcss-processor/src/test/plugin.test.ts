import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { Logger } from '@ecopages/logger';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin';

let tmpDir: string;
let srcDir: string;

async function createProcessor(options: LightningCssProcessorPluginConfig = {}): Promise<LightningCssProcessorPlugin> {
	const plugin = new LightningCssProcessorPlugin({ options });
	plugin.setContext(await finalizeEcoPagesConfig({ rootDir: tmpDir, srcDir: 'src', distDir: 'dist' }));
	return plugin;
}

describe('LightningCssProcessorPlugin', () => {
	beforeEach(() => {
		tmpDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-plugin-test-')));
		srcDir = path.join(tmpDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	test('declares the one stylesheet capability for .css files', () => {
		const plugin = new LightningCssProcessorPlugin({ options: {} });

		expect(plugin.canProcessAsset('stylesheet', '/app/src/a.css')).toBe(true);
		expect(plugin.canProcessAsset('stylesheet', '/app/src/a.scss')).toBe(false);
	});

	test('processes only the stylesheets the filter matches', () => {
		const plugin = new LightningCssProcessorPlugin({ options: { filter: /\.lc\.css$/ } });

		expect(plugin.canProcessAsset('stylesheet', '/app/src/a.lc.css')).toBe(true);
		expect(plugin.canProcessAsset('stylesheet', '/app/src/a.css')).toBe(false);
	});

	test('lowers nesting and color-mix() for an old target', async () => {
		const plugin = await createProcessor({ targets: ['chrome 80'] });

		const { css } = await plugin.transformStylesheet(
			'.card { color: color-mix(in srgb, red, blue); & .title { margin: 0; } }',
			path.join(srcDir, 'card.css'),
		);

		expect(css).not.toContain('color-mix');
		expect(css).not.toMatch(/&/);
		expect(css).toContain('.card .title');
	});

	test('keeps nesting for a target that supports it', async () => {
		const plugin = await createProcessor({ targets: ['chrome 130'] });

		const { css } = await plugin.transformStylesheet(
			'.card { & .title { margin: 0; } }',
			path.join(srcDir, 'card.css'),
		);

		expect(css).toContain('&');
	});

	test('accepts a single browserslist query', async () => {
		const plugin = await createProcessor({ targets: 'chrome 80' });

		const { css } = await plugin.transformStylesheet('.a { & .b { margin: 0; } }', path.join(srcDir, 'a.css'));

		expect(css).toContain('.a .b');
	});

	test('compiles a feature named in include and keeps one named in exclude', async () => {
		const included = await createProcessor({ include: ['Nesting'], targets: ['chrome 130'] });
		const excluded = await createProcessor({ exclude: ['Nesting'], targets: ['chrome 80'] });
		const source = '.a { & .b { margin: 0; } }';

		expect((await included.transformStylesheet(source, path.join(srcDir, 'a.css'))).css).not.toContain('&');
		expect((await excluded.transformStylesheet(source, path.join(srcDir, 'a.css'))).css).toContain('&');
	});

	test('minifies in production and not in development, and minify overrides both', async () => {
		const source = '.a {\n  color: red;\n}\n';
		const file = path.join(srcDir, 'a.css');

		vi.stubEnv('NODE_ENV', 'production');
		expect((await (await createProcessor()).transformStylesheet(source, file)).css).toBe('.a{color:red}');
		expect((await (await createProcessor({ minify: false })).transformStylesheet(source, file)).css).toContain(
			'\n',
		);

		vi.stubEnv('NODE_ENV', 'development');
		expect((await (await createProcessor()).transformStylesheet(source, file)).css).toContain('\n');
		expect((await (await createProcessor({ minify: true })).transformStylesheet(source, file)).css).toBe(
			'.a{color:red}',
		);
	});

	test('runs the visitor', async () => {
		const plugin = await createProcessor({
			visitor: {
				Rule: {
					style(rule) {
						return { ...rule, value: { ...rule.value, selectors: [[{ type: 'class', name: 'renamed' }]] } };
					},
				},
			},
		});

		const { css } = await plugin.transformStylesheet('.a { color: red; }', path.join(srcDir, 'a.css'));

		expect(css).toContain('.renamed');
	});

	test('throws an error that names the file and the position', async () => {
		const plugin = await createProcessor();
		const file = path.join(srcDir, 'broken.css');

		await expect(plugin.transformStylesheet('.a {\n  color: red;\n}\n}\n', file)).rejects.toThrow(
			new RegExp(`${file}:\\d+:\\d+ `),
		);
	});

	test('logs a warning with its location once, instead of failing, with errorRecovery', async () => {
		const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);
		const plugin = await createProcessor({ errorRecovery: true });
		const file = path.join(srcDir, 'recovered.css');
		const source = '.a { color: red; }\n@foo { }\n';

		const { css } = await plugin.transformStylesheet(source, file);
		await plugin.transformStylesheet(source, file);

		expect(css).toContain('.a');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toMatch(new RegExp(`^${file}:2:\\d+ `));
	});
});
