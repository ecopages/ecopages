import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '@ecopages/core';
import { ReactPlugin, reactPlugin } from './react.plugin.ts';

async function getMdxLoaderFilter(plugin: ReactPlugin): Promise<RegExp | undefined> {
	plugin.setConfig({ rootDir: '/tmp/project' } as EcoPagesAppConfig);
	await plugin.prepareBuildContributions();

	let filter: RegExp | undefined;
	await plugin.plugins[0]?.setup({
		onResolve() {},
		onLoad(options) {
			filter = options.filter;
		},
		module() {},
	});
	return filter;
}

describe('ReactPlugin', () => {
	it('supports direct construction with default public options', () => {
		const plugin = reactPlugin();

		expect(plugin.extensions).toEqual(['.tsx']);
	});

	it('supports direct construction with MDX public options', () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				enabled: true,
				extensions: ['.docs.mdx'],
			},
		});

		expect(plugin.extensions).toEqual(['.react.tsx', '.docs.mdx']);
		expect((plugin as any).mdxExtensions).toEqual(['.docs.mdx']);
	});

	it('derives the MDX loader filter from declared MDX extensions only', async () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				enabled: true,
				extensions: ['.react.mdx'],
			},
		});

		const filter = await getMdxLoaderFilter(plugin);

		expect(filter?.test('/tmp/project/src/pages/docs.react.mdx')).toBe(true);
		expect(filter?.test('/tmp/project/src/pages/docs.mdx')).toBe(false);
	});

	it('does not merge leftover compilerOptions.mdxExtensions into the loader filter', async () => {
		const plugin = new ReactPlugin({
			extensions: ['.react.tsx'],
			mdx: {
				enabled: true,
				extensions: ['.react.mdx'],
				compilerOptions: {
					mdxExtensions: ['.mdx'],
				},
			},
		});

		const filter = await getMdxLoaderFilter(plugin);

		expect(filter?.test('/tmp/project/src/pages/docs.react.mdx')).toBe(true);
		expect(filter?.test('/tmp/project/src/pages/docs.mdx')).toBe(false);
	});
});
