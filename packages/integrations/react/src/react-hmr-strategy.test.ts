import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactHmrStrategy } from './react-hmr-strategy.ts';
import type { DefaultHmrContext } from '@ecopages/core';
import { HmrStrategyType } from '@ecopages/core/hmr/hmr-strategy';
import { fileSystem } from '@ecopages/file-system';

function createPageMetadataCache(
	overrides: {
		getDeclaredModules?: (entrypointPath: string) => string[] | undefined;
		ownsEntrypoint?: (entrypointPath: string) => boolean;
	} = {},
) {
	return {
		getDeclaredModules: overrides.getDeclaredModules ?? (() => undefined),
		ownsEntrypoint: overrides.ownsEntrypoint ?? (() => false),
	};
}

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
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('has INTEGRATION type', () => {
		const strategy = new ReactHmrStrategy(createMockContext(), createPageMetadataCache() as any);

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
			createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === '/tmp/src/pages/react-lab.tsx',
			}) as any,
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

	it('ignores watched script entrypoints that React does not own', () => {
		const watchedFiles = new Map<string, string>([
			['/tmp/src/components/radiant-counter.script.tsx', '/assets/_hmr/components/radiant-counter.script.js'],
		]);
		const strategy = new ReactHmrStrategy(
			createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			createPageMetadataCache() as any,
		);

		expect(strategy.matches('/tmp/src/components/radiant-counter.script.tsx')).toBe(false);
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
			createPageMetadataCache({
				getDeclaredModules: () => [],
			}) as any,
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
			createPageMetadataCache() as any,
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

	it('resolves hashed temp outputs when the bundle result returns a placeholder path', async () => {
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.[hash].tmp.js' }],
		}));
		const strategy = new ReactHmrStrategy(
			createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
			}),
			createPageMetadataCache({
				getDeclaredModules: () => [],
			}) as any,
		);

		const existsSpy = vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath: string) => {
			return targetPath === '/tmp/.eco/assets/_hmr/pages/index.123.tmp.js';
		});
		const globSpy = vi
			.spyOn(fileSystem, 'glob')
			.mockResolvedValue(['/tmp/.eco/assets/_hmr/pages/index.123.tmp.js']);
		(strategy as any).processOutput = vi.fn(async () => true);

		const success = await (strategy as any).bundleReactEntrypoint(
			'/tmp/src/pages/index.tsx',
			'/_hmr/pages/index.js',
		);

		expect(success).toBe(true);
		expect(globSpy).toHaveBeenCalledWith(['index.*.tmp.js'], {
			cwd: '/tmp/.eco/assets/_hmr/pages',
		});
		expect((strategy as any).processOutput).toHaveBeenCalledWith(
			'/tmp/.eco/assets/_hmr/pages/index.123.tmp.js',
			'/tmp/.eco/assets/_hmr/pages/index.js',
			'/_hmr/pages/index.js',
		);
	});

	it('rewrites runtime specifiers from the shared HMR registry during output processing', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		const writeAsync = vi.spyOn(fileSystem, 'writeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'readFile').mockResolvedValue(
			'import { useState } from "react";\nimport { jsxDEV } from "react/jsx-dev-runtime";\n',
		);
		const strategy = new ReactHmrStrategy(
			createMockContext({
				getSpecifierMap: () =>
					new Map([
						['react', '/assets/vendors/react.development.js'],
						['react/jsx-dev-runtime', '/assets/vendors/react.development.js'],
					]),
			}),
			createPageMetadataCache() as any,
		);

		const success = await (strategy as any).processOutput(
			'/tmp/.eco/assets/_hmr/components/react-counter.123.tmp.js',
			'/tmp/.eco/assets/_hmr/components/react-counter.js',
			'/_hmr/components/react-counter.js',
		);

		expect(success).toBe(true);
		expect(writeAsync).toHaveBeenCalledWith(
			'/tmp/.eco/assets/_hmr/components/react-counter.js',
			expect.stringContaining('/assets/vendors/react.development.js'),
		);
		expect(writeAsync.mock.calls[0]?.[1]).not.toContain('from "react"');
		expect(writeAsync.mock.calls[0]?.[1]).not.toContain('from "react/jsx-dev-runtime"');
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
			createPageMetadataCache({
				getDeclaredModules: () => [],
				ownsEntrypoint: (entrypointPath) => entrypointPath === changedEntrypoint,
			}) as any,
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
			createPageMetadataCache({
				getDeclaredModules: () => [],
			}) as any,
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
