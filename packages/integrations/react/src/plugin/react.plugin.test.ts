import { describe, expect, it } from 'vitest';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import type { IntegrationRuntimeContext } from '@ecopages/core/integration';
import { ReactPlugin, reactPlugin } from './react.plugin.ts';

async function createConfig(rootDir: string): Promise<IntegrationRuntimeContext['appConfig']> {
	return await finalizeEcoPagesConfig({ rootDir });
}

async function getMdxLoaderFilter(
	plugin: ReactPlugin,
	appConfig: IntegrationRuntimeContext['appConfig'],
): Promise<RegExp | undefined> {
	let filter: RegExp | undefined;
	await plugin.plugins(appConfig)[0]?.setup({
		onResolve() {},
		onLoad(options) {
			filter = options.filter;
		},
		module() {},
		transform() {},
	});
	return filter;
}

describe('ReactPlugin', () => {
	it('supports direct construction with default public options', () => {
		const plugin = reactPlugin();

		expect(plugin.extensions).toEqual(['.tsx']);
		expect(plugin.bundlesPageDependencies).toBe(true);
		expect(
			(plugin as unknown as { rendererConfig: { renderTimeoutMs: number } }).rendererConfig.renderTimeoutMs,
		).toBe(10_000);
	});

	it('passes a custom server render timeout to the renderer config', () => {
		const plugin = reactPlugin({ renderTimeoutMs: 2_500 });

		expect(
			(plugin as unknown as { rendererConfig: { renderTimeoutMs: number } }).rendererConfig.renderTimeoutMs,
		).toBe(2_500);
	});

	it('supports direct construction with MDX public options', () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				extensions: ['.docs.mdx'],
			},
		});

		expect(plugin.extensions).toEqual(['.react.tsx', '.docs.mdx']);
		expect((plugin as any).mdxExtensions).toEqual(['.docs.mdx']);
	});

	it('gives each app runtime its own MDX loader at the same root', async () => {
		const plugin = new ReactPlugin({ mdx: {} });
		const firstConfig = await createConfig('/tmp/shared-project');
		const secondConfig = await createConfig('/tmp/shared-project');

		const first = plugin.plugins(firstConfig)[0];
		const second = plugin.plugins(secondConfig)[0];

		expect(first).not.toBe(second);
		expect(plugin.plugins(firstConfig)[0]).not.toBe(first);
	});

	it('derives the MDX loader filter from declared MDX extensions only', async () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				extensions: ['.react.mdx'],
			},
		});

		const filter = await getMdxLoaderFilter(plugin, await createConfig('/tmp/project'));

		expect(filter?.test('/tmp/project/src/pages/docs.react.mdx')).toBe(true);
		expect(filter?.test('/tmp/project/src/pages/docs.mdx')).toBe(false);
	});

	it('does not merge leftover compilerOptions.mdxExtensions into the loader filter', async () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				extensions: ['.react.mdx'],
				compilerOptions: {
					mdxExtensions: ['.mdx'],
				},
			},
		});

		const filter = await getMdxLoaderFilter(plugin, await createConfig('/tmp/project'));

		expect(filter?.test('/tmp/project/src/pages/docs.react.mdx')).toBe(true);
		expect(filter?.test('/tmp/project/src/pages/docs.mdx')).toBe(false);
	});
});
