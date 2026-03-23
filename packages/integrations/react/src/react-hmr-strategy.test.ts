import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { DefaultHmrContext } from '@ecopages/core';
import { HmrStrategyType } from '@ecopages/core/hmr/hmr-strategy';

function createImportServerModuleMock(result: {
	config: Record<string, unknown>;
}): DefaultHmrContext['importServerModule'] {
	return vi.fn(
		(async (_filePath: string) => result) as DefaultHmrContext['importServerModule'],
	) as unknown as DefaultHmrContext['importServerModule'];
}

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
		importServerModule: createImportServerModuleMock({ config: {} }),
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

	it('matches route templates only when their configured extension is owned by React', () => {
		const watchedFiles = new Map<string, string>([
			['/tmp/src/pages/react-lab.tsx', '/assets/_hmr/pages/react-lab.js'],
		]);
		const strategy = new ReactHmrStrategy(
			createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			{ getDeclaredModules: () => undefined } as any,
			undefined,
			['.tsx', '.react.tsx'],
			['.tsx', '.react.tsx', '.kita.tsx', '.lit.tsx'],
		);

		expect(strategy.matches('/tmp/src/pages/index.kita.tsx')).toBe(false);
		expect(strategy.matches('/tmp/src/layouts/base-layout.lit.tsx')).toBe(false);
		expect(strategy.matches('/tmp/src/pages/react-lab.tsx')).toBe(true);
		expect(strategy.matches('/tmp/src/pages/react-lab.react.tsx')).toBe(true);
		expect(strategy.matches('/tmp/src/components/widget.kita.tsx')).toBe(true);
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
		const importServerModule = createImportServerModuleMock({
			config: {
				requires: ['react', './client-entry.ts'],
			},
		});
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

	it('process only broadcasts the changed watched entrypoint update', async () => {
		const changedEntrypoint = '/tmp/src/pages/react-lab.react.tsx';
		const otherEntrypoint = '/tmp/src/pages/react-content.mdx';
		const watchedFiles = new Map<string, string>([
			[changedEntrypoint, '/assets/_hmr/pages/react-lab.react.js'],
			[otherEntrypoint, '/assets/_hmr/pages/react-content.js'],
		]);

		const strategy = new ReactHmrStrategy(
			createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			{ getDeclaredModules: () => [] } as any,
			undefined,
			['.react.tsx'],
			['.react.tsx', '.mdx', '.kita.tsx'],
		);

		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process(changedEntrypoint);

		expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledTimes(1);
		expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledWith(
			changedEntrypoint,
			'/assets/_hmr/pages/react-lab.react.js',
		);
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: '/assets/_hmr/pages/react-lab.react.js',
					timestamp: expect.any(Number),
				},
			],
		});
	});

	it('process rebuilds all watched entrypoints for non-entrypoint dependency changes', async () => {
		const entrypointA = '/tmp/src/pages/react-lab.react.tsx';
		const entrypointB = '/tmp/src/pages/react-content.mdx';
		const changedDependency = '/tmp/src/components/theme-toggle.react.tsx';
		const watchedFiles = new Map<string, string>([
			[entrypointA, '/assets/_hmr/pages/react-lab.react.js'],
			[entrypointB, '/assets/_hmr/pages/react-content.js'],
		]);

		const strategy = new ReactHmrStrategy(
			createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			{ getDeclaredModules: () => [] } as any,
			{},
			['.react.tsx', '.mdx'],
			['.react.tsx', '.mdx', '.kita.tsx'],
		);

		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process(changedDependency);

		expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledTimes(2);
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: '/assets/_hmr/pages/react-lab.react.js',
					timestamp: expect.any(Number),
				},
				{
					type: 'update',
					path: '/assets/_hmr/pages/react-content.js',
					timestamp: expect.any(Number),
				},
			],
		});
	});
});
