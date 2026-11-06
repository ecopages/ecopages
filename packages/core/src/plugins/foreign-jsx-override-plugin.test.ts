import { describe, expect, it } from 'vitest';
import { getPluginTransform } from '../__fixtures__/build/transform-plugin.ts';
import { createForeignJsxOverridePlugin } from './foreign-jsx-override-plugin.ts';

describe('foreign-jsx-override-plugin', () => {
	it('matches only files that end with every dot of a foreign extension', () => {
		const plugin = createForeignJsxOverridePlugin({
			hostJsxImportSource: 'react',
			foreignExtensions: ['.kita.tsx'],
		});
		let filter: RegExp | undefined;

		plugin.setup({
			transform(options: { filter: RegExp }) {
				filter = options.filter;
			},
		} as never);

		expect(filter?.test('/src/a.kita.tsx')).toBe(true);
		expect(filter?.test('/src/a.kitaXtsx')).toBe(false);
	});

	it('prepends the host pragma and keeps a source map to the original file', () => {
		const transform = getPluginTransform(
			createForeignJsxOverridePlugin({ hostJsxImportSource: 'react', foreignExtensions: ['.jsx'] }),
		);

		const result = transform.transform('export const Component = () => <div />;', '/src/component.jsx?x=1');

		expect(result).toMatchObject({
			code: '/** @jsxImportSource react */\nexport const Component = () => <div />;',
			map: expect.objectContaining({ sources: ['/src/component.jsx'] }),
		});
	});

	it('returns undefined when a file already declares jsxImportSource', () => {
		const transform = getPluginTransform(
			createForeignJsxOverridePlugin({ hostJsxImportSource: 'react', foreignExtensions: ['.tsx'] }),
		);

		expect(
			transform.transform('/** @jsxImportSource react */\nexport const Component = () => <div />;', '/src/c.tsx'),
		).toBeUndefined();
	});

	it('skips excluded extensions', () => {
		const transform = getPluginTransform(
			createForeignJsxOverridePlugin({
				hostJsxImportSource: 'react',
				foreignExtensions: ['.tsx'],
				excludeExtensions: ['.react.tsx'],
			}),
		);

		expect(transform.transform('export default 1;', '/src/c.react.tsx')).toBeUndefined();
	});
});
