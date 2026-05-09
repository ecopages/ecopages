import { describe, expect, it } from 'vitest';
import { ReactPlugin, reactPlugin } from './react.plugin.ts';

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
});
