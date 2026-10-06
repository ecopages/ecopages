import { describe, expect, it } from 'vitest';
import {
	applySourceTransform,
	createVitePluginsFromAppSourceTransforms,
	createEcoBuildPluginFromSourceTransform,
	getAppSourceTransforms,
	createVitePluginFromSourceTransform,
	normalizeTransformId,
	type EcoSourceTransform,
} from './source-transform.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';

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

	it('creates a Vite-compatible transform plugin', () => {
		const vitePlugin = createVitePluginFromSourceTransform(transform);
		const result = vitePlugin.transform('export const value = 1;', '/src/main.tsx?import');

		expect(vitePlugin.name).toBe('test-transform');
		expect(result).toEqual({
			code: '/* injected */\nexport const value = 1;',
		});
	});

	it('adapts a source transform to a build plugin with a transform hook', () => {
		const buildPlugin = createEcoBuildPluginFromSourceTransform({ ...transform, enforce: 'pre' });

		expect(buildPlugin.name).toBe('test-transform');
		expect(buildPlugin.transform?.filter).toBe(transform.filter);
		expect(buildPlugin.transform?.order).toBe('pre');
		expect(buildPlugin.transform?.handler('export const value = 1;', '/src/main.tsx')).toEqual({
			code: '/* injected */\nexport const value = 1;',
		});
	});

	it('collects app-owned source transforms and adapts them to Vite plugins', () => {
		const appConfig = {
			sourceTransforms: new Map([[transform.name, transform]]),
		} as EcoPagesAppConfig;

		expect(getAppSourceTransforms(appConfig)).toEqual([transform]);
		expect(createVitePluginsFromAppSourceTransforms(appConfig)).toHaveLength(1);
		expect(createVitePluginsFromAppSourceTransforms(appConfig)[0].name).toBe('test-transform');
	});

	it('calls a class-based transform with its own this on the Vite and build plugin paths', () => {
		class BannerTransform implements EcoSourceTransform {
			readonly name = 'banner';
			readonly filter = /main\.tsx$/;
			readonly #banner = '/* banner */';

			transform(code: string): string {
				return `${this.#banner}${code}`;
			}
		}
		const classTransform = new BannerTransform();

		expect(createVitePluginFromSourceTransform(classTransform).transform('x', '/src/main.tsx')).toBe(
			'/* banner */x',
		);
		expect(createEcoBuildPluginFromSourceTransform(classTransform).transform?.handler('x', '/src/main.tsx')).toBe(
			'/* banner */x',
		);
	});
});
