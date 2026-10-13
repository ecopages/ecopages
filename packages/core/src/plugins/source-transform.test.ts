import { describe, expect, it } from 'vitest';
import {
	applySourceTransform,
	createEcoBuildPluginFromSourceTransform,
	mergeSourceTransformPlugins,
	normalizeTransformId,
	type EcoSourceTransform,
} from './source-transform.ts';

describe('source-transform', () => {
	const transform: EcoSourceTransform = {
		name: 'test-transform',
		filter: /main\.tsx$/,
		transform(code) {
			return {
				code: `/* injected */\n${code}`,
			};
		},
	};

	it('normalizes ids by stripping query and hash suffixes', () => {
		expect(normalizeTransformId('/src/main.tsx?import')).toBe('/src/main.tsx');
		expect(normalizeTransformId('/src/main.tsx#hash')).toBe('/src/main.tsx');
	});

	it('applies transforms against normalized ids', () => {
		const result = applySourceTransform(transform, 'export const value = 1;', '/src/main.tsx?import');

		expect(result).toEqual({
			code: '/* injected */\nexport const value = 1;',
		});
	});

	it('throws when a source transform has the name of a plugin of the same request', () => {
		const plugin = { name: transform.name, setup() {} };

		expect(() => mergeSourceTransformPlugins([plugin], [transform])).toThrow(
			`Source transform "${transform.name}" has the name of a build plugin of the same request.`,
		);
		expect(
			mergeSourceTransformPlugins([plugin], [{ ...transform, name: 'other-transform' }]).map((p) => p.name),
		).toEqual([transform.name, 'other-transform']);
	});

	it('orders merged transform plugins pre, default, and post', () => {
		const transforms = [
			{
				name: 'post',
				enforce: 'post' as const,
				filter: /main\.tsx$/,
				transform(code: string) {
					return code;
				},
			},
			{
				name: 'pre',
				enforce: 'pre' as const,
				filter: /main\.tsx$/,
				transform(code: string) {
					return code;
				},
			},
			{
				name: 'default',
				filter: /main\.tsx$/,
				transform(code: string) {
					return code;
				},
			},
		];

		const order = mergeSourceTransformPlugins([], transforms).map((plugin) => plugin.name);

		expect(order).toEqual(['pre', 'default', 'post']);
	});

	it('creates an Ecopages build plugin wrapper', async () => {
		const buildPlugin = createEcoBuildPluginFromSourceTransform(transform);
		let transformCallback: ((code: string, id: string) => unknown) | undefined;

		buildPlugin.setup({
			transform(_options: unknown, callback: unknown) {
				transformCallback = callback as typeof transformCallback;
			},
		} as never);

		const result = await transformCallback?.('export const value = 1;', '/src/main.tsx?import');

		expect(result).toEqual({
			code: '/* injected */\nexport const value = 1;',
		});
	});
});
