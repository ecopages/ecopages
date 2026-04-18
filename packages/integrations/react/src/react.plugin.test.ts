import { describe, expect, it } from 'vitest';
import { eco } from '@ecopages/core';
import { ReactPlugin, reactPlugin } from './react.plugin.ts';

describe('ReactPlugin', () => {
	it('should expose runtime specifier mappings through the base integration hook', () => {
		const plugin = reactPlugin();

		expect(plugin.getRuntimeSpecifierMap()).toMatchObject({
			react: '/assets/vendors/react.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		});
	});

	it('supports direct construction with default public options', () => {
		const plugin = new ReactPlugin();

		expect(plugin.extensions).toEqual(['.tsx']);
		expect(plugin.getRuntimeSpecifierMap()).toMatchObject({
			react: '/assets/vendors/react.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		});
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
});
