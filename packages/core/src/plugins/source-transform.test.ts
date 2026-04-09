import { describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
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

	it('creates an Ecopages build plugin wrapper', async () => {
		const buildPlugin = createEcoBuildPluginFromSourceTransform(transform);
		let onLoadCallback: ((args: { path: string }) => unknown) | undefined;

		buildPlugin.setup({
			onLoad(_options: unknown, callback: unknown) {
				onLoadCallback = callback as typeof onLoadCallback;
			},
		} as never);

		const readSpy = vi.spyOn(fileSystem, 'readFileSync').mockReturnValue('export const value = 1;');

		try {
			const result = await onLoadCallback?.({ path: '/src/main.tsx?import' });

			expect(result).toEqual({
				contents: '/* injected */\nexport const value = 1;',
				loader: 'tsx',
				resolveDir: '/src',
			});
		} finally {
			readSpy.mockRestore();
		}
	});

	it('collects app-owned source transforms and adapts them to Vite plugins', () => {
		const appConfig = {
			sourceTransforms: new Map([[transform.name, transform]]),
		} as EcoPagesAppConfig;

		expect(getAppSourceTransforms(appConfig)).toEqual([transform]);
		expect(createVitePluginsFromAppSourceTransforms(appConfig)).toHaveLength(1);
		expect(createVitePluginsFromAppSourceTransforms(appConfig)[0].name).toBe('test-transform');
	});
});
