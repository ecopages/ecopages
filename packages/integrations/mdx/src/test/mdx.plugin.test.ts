import { describe, expect, it } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { mdxPlugin } from '../mdx.plugin.ts';

const Config = await new ConfigBuilder()
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

describe('MDXPlugin', () => {
	it('passes resolved compiler options into renderer instances', () => {
		const plugin = mdxPlugin({
			compilerOptions: {
				jsxImportSource: '@kitajs/html',
				format: 'mdx',
			},
		});

		plugin.setConfig(Config);
		plugin.setRuntimeOrigin('http://localhost:3000');

		const renderer = plugin.initializeRenderer();

		expect(renderer.compilerOptions).toMatchObject({
			jsxImportSource: '@kitajs/html',
			format: 'mdx',
		});
	});
});