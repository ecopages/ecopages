import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { DefaultHmrContext } from '@ecopages/core';
import { HmrStrategyType } from '@ecopages/core/hmr/hmr-strategy';

function createMockContext(overrides: Partial<DefaultHmrContext> = {}): DefaultHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getSpecifierMap: () => new Map(),
		getDistDir: () => '/tmp/.eco/assets/_hmr',
		getPlugins: () => [],
		getSrcDir: () => '/tmp/src',
		getLayoutsDir: () => '/tmp/src/layouts',
		getPagesDir: () => '/tmp/src/pages',
		getBuildExecutor: () => ({
			build: vi.fn(async () => ({
				success: true,
				logs: [],
				outputs: [],
			})),
		}),
		getBrowserBundleService: () => ({
			bundle: vi.fn(async () => ({
				success: true,
				logs: [],
				outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp' }],
			})),
		}),
		importServerModule: vi.fn(async () => ({ config: {} })),
		...overrides,
	};
}

describe('ReactHmrStrategy', () => {
	it('has INTEGRATION type', () => {
		const strategy = new ReactHmrStrategy(createMockContext(), {
			getDeclaredModules: () => undefined,
		} as any);

		expect(strategy.type).toBe(HmrStrategyType.INTEGRATION);
	});

	it('routes React browser rebuilds through BrowserBundleService', async () => {
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp' }],
		}));
		const build = vi.fn(async () => {
			throw new Error('React HMR browser rebuild should not call the raw build executor.');
		});
		const entrypointPath = '/tmp/src/pages/index.tsx';
		const strategy = new ReactHmrStrategy(
			createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
				getBuildExecutor: () => ({ build }),
			}),
			{
				getDeclaredModules: () => [],
			} as any,
		);

		(strategy as any).processOutput = vi.fn(async () => true);

		const success = await (strategy as any).bundleReactEntrypoint(entrypointPath, '/_hmr/pages/index.js');

		expect(success).toBe(true);
		expect(bundle).toHaveBeenCalledWith(
			expect.objectContaining({
				profile: 'hmr-entrypoint',
				entrypoints: [entrypointPath],
				outdir: path.join('/tmp/.eco/assets/_hmr', 'pages'),
				naming: '[name].[hash].tmp',
				minify: false,
			}),
		);
		expect(build).not.toHaveBeenCalled();
	});

	it('loads server-side page metadata through the shared HMR server-module path', async () => {
		const importServerModule = vi.fn(async () => ({
			config: {
				requires: ['react', './client-entry.ts'],
			},
		}));
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp' }],
		}));
		const build = vi.fn(async () => {
			throw new Error('React HMR metadata loading should not call the raw build executor.');
		});
		const strategy = new ReactHmrStrategy(
			createMockContext({
				importServerModule,
				getBrowserBundleService: () => ({ bundle }) as any,
				getBuildExecutor: () => ({ build }),
			}),
			{
				getDeclaredModules: () => undefined,
			} as any,
		);

		(strategy as any).processOutput = vi.fn(async () => true);

		const success = await (strategy as any).bundleReactEntrypoint(
			'/tmp/src/pages/index.tsx',
			'/_hmr/pages/index.js',
		);

		expect(success).toBe(true);
		expect(importServerModule).toHaveBeenCalledWith('/tmp/src/pages/index.tsx');
		expect(build).not.toHaveBeenCalled();
	});
});
