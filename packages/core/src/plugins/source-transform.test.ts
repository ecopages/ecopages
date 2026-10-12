import { describe, expect, it } from 'vitest';
import {
	applySourceTransform,
	applySourceTransforms,
	createEcoBuildPluginFromSourceTransform,
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

	it('applies transforms in pre, default, and post order', () => {
		const calls: string[] = [];
		const transforms = [
			{
				name: 'post',
				enforce: 'post' as const,
				filter: /main\.tsx$/,
				transform(code: string) {
					calls.push('post');
					return code;
				},
			},
			{
				name: 'pre',
				enforce: 'pre' as const,
				filter: /main\.tsx$/,
				transform(code: string) {
					calls.push('pre');
					return code;
				},
			},
			{
				name: 'default',
				filter: /main\.tsx$/,
				transform(code: string) {
					calls.push('default');
					return code;
				},
			},
		];

		applySourceTransforms(transforms, 'export const value = 1;', '/src/main.tsx');

		expect(calls).toEqual(['pre', 'default', 'post']);
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
