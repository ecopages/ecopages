import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactHmrStrategy } from './hmr-strategy.ts';
import type { HmrPageMetadataCache } from './page-metadata-cache.ts';
import type { DefaultHmrContext } from '@ecopages/core';
import { createBrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import {
	createDevHmrEntrypointCache,
	setDevHmrEntrypointCacheEntry,
} from '@ecopages/core/build/dev-hmr-entrypoint-cache';
import { HmrStrategyType } from '@ecopages/core/hmr/hmr-strategy';
import { fileSystem } from '@ecopages/file-system';

const defaultRuntimeManifest = createBrowserRuntimeManifest([
	{
		specifier: 'react',
		owner: '@ecopages/react',
		importPath: 'react',
		publicPath: '/assets/vendors/react.development.js',
	},
	{
		specifier: 'react/jsx-runtime',
		owner: '@ecopages/react',
		importPath: 'react/jsx-runtime',
		publicPath: '/assets/vendors/react.development.js',
	},
	{
		specifier: 'react/jsx-dev-runtime',
		owner: '@ecopages/react',
		importPath: 'react/jsx-dev-runtime',
		publicPath: '/assets/vendors/react.development.js',
	},
	{
		specifier: 'react-dom',
		owner: '@ecopages/react',
		importPath: 'react-dom',
		publicPath: '/assets/vendors/react-dom.development.js',
	},
	{
		specifier: 'react-dom/client',
		owner: '@ecopages/react',
		importPath: 'react-dom/client',
		publicPath: '/assets/vendors/react-dom.development.js',
	},
]);

function devTransformPageUrl(relativeJsPath: string): string {
	return `/assets/__eco_dev__/pages/${relativeJsPath}`;
}

function createPageMetadataCache(
	overrides: {
		initialOwnedEntrypoints?: string[];
		getDeclaredModules?: (entrypointPath: string) => string[] | undefined;
		ownsEntrypoint?: (entrypointPath: string) => boolean;
		markOwnedEntrypoint?: (entrypointPath: string) => void;
		setDeclaredModules?: (entrypointPath: string, declaredModules: string[]) => void;
	} = {},
) {
	const owned = new Set(
		(overrides.initialOwnedEntrypoints ?? []).map((entrypointPath) => path.resolve(entrypointPath)),
	);

	return {
		getDeclaredModules: overrides.getDeclaredModules ?? (() => undefined),
		getOwnedEntrypoints: () => [...owned].sort((left, right) => left.localeCompare(right)),
		ownsEntrypoint:
			overrides.ownsEntrypoint ?? ((entrypointPath: string) => owned.has(path.resolve(entrypointPath))),
		markOwnedEntrypoint: (entrypointPath: string) => {
			owned.add(path.resolve(entrypointPath));
			overrides.markOwnedEntrypoint?.(entrypointPath);
		},
		setDeclaredModules: overrides.setDeclaredModules ?? (() => undefined),
	} as HmrPageMetadataCache;
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
		getDistDir: () => '/tmp/.eco/assets/_hmr',
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
		getEntrypointDependencyGraph: () => ({
			supportsSelectiveInvalidation: () => true,
			getDependencyEntrypoints: () => new Set(),
			setEntrypointDependencies: () => {},
			clearEntrypointDependencies: () => {},
			reset: () => {},
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
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		expect(strategy.type).toBe(HmrStrategyType.INTEGRATION);
	});

	it('claims owned React entrypoints for cold registration emission', () => {
		const pagePath = '/tmp/src/pages/index.tsx';
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === pagePath,
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		expect(strategy.canEmitEntrypoint(pagePath)).toBe(true);
	});

	it('process returns none when no entrypoints are registered yet', async () => {
		const pagePath = '/tmp/src/pages/index.tsx';
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.js' }],
		}));
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getBrowserBundleService: () => ({ bundle }),
			}),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === pagePath,
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		await expect(strategy.process(pagePath)).resolves.toEqual({ type: 'none' });
		expect(bundle).not.toHaveBeenCalled();
	});

	it('matches route templates only when their configured extension is owned by React', () => {
		const watchedFiles = new Map<string, string>([
			['/tmp/src/pages/react-lab.tsx', '/assets/__eco_dev__/pages/react-lab.js'],
		]);
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === '/tmp/src/pages/react-lab.tsx',
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
			ownedTemplateExtensions: ['.tsx', '.react.tsx'],
			allTemplateExtensions: ['.tsx', '.react.tsx', '.kita.tsx', '.lit.tsx'],
		});

		expect(strategy.matches('/tmp/src/pages/index.kita.tsx')).toBe(false);
		expect(strategy.matches('/tmp/src/layouts/base-layout.lit.tsx')).toBe(false);
		expect(strategy.matches('/tmp/src/pages/react-lab.tsx')).toBe(true);
		expect(strategy.matches('/tmp/src/pages/react-lab.react.tsx')).toBe(true);
		expect(strategy.matches('/tmp/src/components/widget.tsx')).toBe(true);
		expect(strategy.matches('/tmp/src/components/widget.kita.tsx')).toBe(false);
		expect(strategy.matches('/tmp/src/views/explicit-team-view.kita.tsx')).toBe(false);
	});

	it('ignores watched script entrypoints that React does not own', () => {
		const watchedFiles = new Map<string, string>([
			['/tmp/src/components/radiant-counter.script.tsx', '/assets/_hmr/components/radiant-counter.script.js'],
		]);
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		expect(strategy.matches('/tmp/src/components/radiant-counter.script.tsx')).toBe(false);
	});

	it('routes React browser rebuilds through BrowserBundleService', async () => {
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp.js' }],
		}));
		const build = vi.fn(async () => {
			throw new Error('React HMR browser rebuild should not call the raw build executor.');
		});
		const entrypointPath = '/tmp/src/pages/index.tsx';
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
				getBuildExecutor: () => ({ build }),
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).processOutput = vi.fn(async () => true);
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);

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
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp.js' }],
		}));
		const build = vi.fn(async () => {
			throw new Error('React HMR metadata loading should not call the raw build executor.');
		});
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				importServerModule,
				getBrowserBundleService: () => ({ bundle }) as any,
				getBuildExecutor: () => ({ build }),
			}),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).processOutput = vi.fn(async () => true);
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);

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
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath: string) => {
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

	it('leaves runtime imports unchanged during output processing', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		const writeAsync = vi.spyOn(fileSystem, 'writeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'readFile').mockResolvedValue(
			'import { useState } from "react";\nimport { jsxDEV } from "react/jsx-dev-runtime";\n',
		);
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const success = await (strategy as any).processOutput(
			'/tmp/.eco/assets/_hmr/components/react-counter.123.tmp.js',
			'/tmp/.eco/assets/_hmr/components/react-counter.js',
			'/_hmr/components/react-counter.js',
		);

		expect(success).toBe(true);
		expect(writeAsync).toHaveBeenCalledWith(
			'/tmp/.eco/assets/_hmr/components/react-counter.js',
			expect.stringContaining('from "react"'),
		);
		expect(writeAsync.mock.calls[0]?.[1]).toContain('from "react/jsx-dev-runtime"');
	});

	it('rewrites grouped HMR chunk imports to the served _hmr chunk root during output processing', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		const writeAsync = vi.spyOn(fileSystem, 'writeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'readFile').mockResolvedValue(
			'import { a } from "../../../chunk-m6tevyj7.js";\nconst b = () => import("../../../chunk-rvgy3r62.js");\n',
		);
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const success = await (strategy as any).processOutput(
			'/tmp/.eco/assets/_hmr/pages/docs/index.123.tmp.js',
			'/tmp/.eco/assets/_hmr/pages/docs/index.js',
			'/assets/_hmr/pages/docs/index.js',
		);

		expect(success).toBe(true);
		expect(writeAsync).toHaveBeenCalledWith(
			'/tmp/.eco/assets/_hmr/pages/docs/index.js',
			expect.stringContaining('from "/assets/_hmr/chunk-m6tevyj7.js"'),
		);
		expect(writeAsync.mock.calls[0]?.[1]).toContain('import("/assets/_hmr/chunk-rvgy3r62.js")');
	});

	it('treats wrapped ENOENT read errors as stale temp outputs during output processing', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		const removeAsync = vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);
		const writeAsync = vi.spyOn(fileSystem, 'writeAsync').mockResolvedValue(undefined);
		vi.spyOn(fileSystem, 'readFile').mockRejectedValue(
			new Error(
				'Error reading file: /tmp/.eco/assets/_hmr/pages/about.123.tmp.js, ENOENT: no such file or directory',
				{
					cause: { code: 'ENOENT' },
				},
			),
		);
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const success = await (strategy as any).processOutput(
			'/tmp/.eco/assets/_hmr/pages/about.123.tmp.js',
			'/tmp/.eco/assets/_hmr/pages/about.js',
			'/assets/_hmr/pages/about.js',
		);

		expect(success).toBe(false);
		expect(writeAsync).not.toHaveBeenCalled();
		expect(removeAsync).toHaveBeenCalledWith('/tmp/.eco/assets/_hmr/pages/about.123.tmp.js');
	});

	it('process only broadcasts the changed watched entrypoint update', async () => {
		const changedEntrypoint = '/tmp/src/pages/react-lab.react.tsx';
		const otherEntrypoint = '/tmp/src/pages/react-content.mdx';
		const watchedFiles = new Map<string, string>([
			[changedEntrypoint, '/assets/__eco_dev__/pages/react-lab.react.js'],
			[otherEntrypoint, '/assets/__eco_dev__/pages/react-content.js'],
		]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				ownsEntrypoint: (entrypointPath) => entrypointPath === changedEntrypoint,
				initialOwnedEntrypoints: [changedEntrypoint],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
			ownedTemplateExtensions: ['.react.tsx'],
			allTemplateExtensions: ['.react.tsx', '.mdx', '.kita.tsx'],
		});

		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process(changedEntrypoint);

		expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: '/assets/__eco_dev__/pages/react-lab.react.js',
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
			[entrypointA, '/assets/__eco_dev__/pages/react-lab.react.js'],
			[entrypointB, '/assets/__eco_dev__/pages/react-content.js'],
		]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				initialOwnedEntrypoints: [entrypointA, entrypointB],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
			mdxCompilerOptions: {},
			ownedTemplateExtensions: ['.react.tsx', '.mdx'],
			allTemplateExtensions: ['.react.tsx', '.mdx', '.kita.tsx'],
		});

		(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);

		const action = await strategy.process(changedDependency);

		expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
		expect(action).toEqual({
			type: 'broadcast',
			events: expect.arrayContaining([
				{
					type: 'update',
					path: '/assets/__eco_dev__/pages/react-lab.react.js',
					timestamp: expect.any(Number),
				},
				{
					type: 'update',
					path: '/assets/__eco_dev__/pages/react-content.js',
					timestamp: expect.any(Number),
				},
			]),
		});
		expect(action.events).toHaveLength(2);
	});

	it('process broadcasts only the requested dev transform page when sibling pages are grouped', async () => {
		const changedEntrypoint = '/tmp/src/pages/index.tsx';
		const watchedFiles = new Map<string, string>([[changedEntrypoint, devTransformPageUrl('index.js')]]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				ownsEntrypoint: (entrypointPath) => entrypointPath === changedEntrypoint,
				initialOwnedEntrypoints: [changedEntrypoint, '/tmp/src/pages/dashboard.tsx'],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);
		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process(changedEntrypoint);

		expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
		expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: devTransformPageUrl('index.js'),
					timestamp: expect.any(Number),
				},
			],
		});
	});

	it('process broadcasts dev transform URLs without rebuilding disk page bundles', async () => {
		const changedEntrypoint = '/tmp/src/pages/docs/index.tsx';
		const devTransformUrl = '/assets/__eco_dev__/pages/docs/index.js';
		const watchedFiles = new Map<string, string>([[changedEntrypoint, devTransformUrl]]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				ownsEntrypoint: (entrypointPath) => entrypointPath === changedEntrypoint,
				initialOwnedEntrypoints: [changedEntrypoint],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);
		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process(changedEntrypoint);

		expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
		expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: devTransformUrl,
					timestamp: expect.any(Number),
				},
			],
		});
	});

	it('process keeps non-page entrypoints on the per-entrypoint path when page targets are grouped', async () => {
		const pageEntrypoint = '/tmp/src/pages/index.tsx';
		const islandEntrypoint = '/tmp/src/components/counter.tsx';
		const watchedFiles = new Map<string, string>([
			[pageEntrypoint, '/assets/__eco_dev__/pages/index.js'],
			[islandEntrypoint, '/assets/_hmr/components/counter.js'],
		]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				initialOwnedEntrypoints: [pageEntrypoint, '/tmp/src/pages/dashboard.tsx'],
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);
		(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

		const action = await strategy.process('/tmp/src/components/theme-toggle.tsx');

		expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
		expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledTimes(1);
		expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledWith(
			'/tmp/src/components/counter.tsx',
			'/assets/_hmr/components/counter.js',
		);
		expect(action).toEqual({
			type: 'broadcast',
			events: [
				{
					type: 'update',
					path: '/assets/__eco_dev__/pages/index.js',
					timestamp: expect.any(Number),
				},
				{
					type: 'update',
					path: '/assets/_hmr/components/counter.js',
					timestamp: expect.any(Number),
				},
			],
		});
	});

	it('bundleReactEntrypoints matches grouped temp outputs for dynamic route basenames before encoding final HMR paths', async () => {
		const entrypointPath = '/tmp/src/pages/posts/[slug].tsx';
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/posts/_slug_.123.tmp.js' }],
		}));
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				setDeclaredModules: () => undefined,
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).processOutput = vi.fn(async () => true);
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);

		const outputs = await (strategy as any).bundleReactEntrypoints([
			{
				entrypointPath,
				outputUrl: '/assets/_hmr/pages/posts/_slug_.js',
			},
		]);

		expect(outputs).toEqual(['/assets/_hmr/pages/posts/_slug_.js']);
		expect((strategy as any).processOutput).toHaveBeenCalledWith(
			'/tmp/.eco/assets/_hmr/pages/posts/_slug_.123.tmp.js',
			'/tmp/.eco/assets/_hmr/pages/posts/_slug_.js',
			'/assets/_hmr/pages/posts/_slug_.js',
		);
	});

	it('bundleReactEntrypoints clears stale HMR output before the grouped build to avoid stale chunk references', async () => {
		const bundle = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/.eco/assets/_hmr/pages/index.123.tmp.js' }],
		}));
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getBrowserBundleService: () => ({ bundle }) as any,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				setDeclaredModules: () => undefined,
			}) as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		(strategy as any).processOutput = vi.fn(async () => true);

		await (strategy as any).bundleReactEntrypoints([
			{ entrypointPath: '/tmp/src/pages/index.tsx', outputUrl: '/_hmr/pages/index.js' },
		]);

		expect(bundle).toHaveBeenCalledWith(
			expect.objectContaining({
				profile: 'hmr-entrypoint',
				entrypoints: { 'pages/index': '/tmp/src/pages/index.tsx' },
				splitting: true,
				naming: '[name].[hash].tmp',
			}),
		);
	});

	it('getRolldownEntryKey produces distinct keys for sibling dynamic routes', () => {
		const strategy = new ReactHmrStrategy({
			context: createMockContext({}) as any,
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const keyA = (strategy as any).getRolldownEntryKey('/tmp/src/pages/posts/[slug].tsx');
		const keyB = (strategy as any).getRolldownEntryKey('/tmp/src/pages/[slug]/posts.tsx');

		expect(keyA).not.toBe(keyB);
	});

	it('clearHmrOutdir is a no-op when the outdir does not exist', async () => {
		const strategy = new ReactHmrStrategy({
			context: createMockContext({}) as any,
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const existsSpy = vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const globSpy = vi.spyOn(fileSystem, 'glob').mockResolvedValue([]);
		const removeSpy = vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);

		await (strategy as any).clearHmrOutdir('/nonexistent/dir');

		expect(globSpy).not.toHaveBeenCalled();
		expect(removeSpy).not.toHaveBeenCalled();
		existsSpy.mockRestore();
	});

	it('clearHmrOutdir removes .tmp.js files and the chunks subdirectory but preserves the runtime script', async () => {
		const strategy = new ReactHmrStrategy({
			context: createMockContext({}) as any,
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		vi.spyOn(fileSystem, 'exists').mockImplementation((p) => p === '/tmp/.eco/assets/_hmr' || p.endsWith('chunks'));
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['pages/index.123.tmp.js', 'pages/_slug_.456.tmp.js']);
		const removeSpy = vi.spyOn(fileSystem, 'removeAsync').mockResolvedValue(undefined);

		await (strategy as any).clearHmrOutdir('/tmp/.eco/assets/_hmr');

		const removed = removeSpy.mock.calls.map(([target]) => String(target));
		expect(removed).toContain('/tmp/.eco/assets/_hmr/pages/index.123.tmp.js');
		expect(removed).toContain('/tmp/.eco/assets/_hmr/pages/_slug_.456.tmp.js');
		expect(removed).toContain('/tmp/.eco/assets/_hmr/chunks');
		// The runtime script must not be removed.
		expect(removed.find((target) => target.endsWith('_hmr_runtime.js'))).toBeUndefined();
	});

	it('resolveTempOutputPath falls back to glob when the literal path is missing', async () => {
		const strategy = new ReactHmrStrategy({
			context: createMockContext({}) as any,
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		const placeholder = '/tmp/.eco/assets/_hmr/pages/index.[hash].tmp.js';
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		vi.spyOn(fileSystem, 'glob').mockResolvedValue(['/tmp/.eco/assets/_hmr/pages/index.999.tmp.js']);

		const resolved = await (strategy as any).resolveTempOutputPath(placeholder);
		expect(resolved).toBe('/tmp/.eco/assets/_hmr/pages/index.999.tmp.js');
	});

	it('resolveTempOutputPath returns null when neither lookup nor glob finds the file', async () => {
		const strategy = new ReactHmrStrategy({
			context: createMockContext({}) as any,
			pageMetadataCache: createPageMetadataCache() as any,
			runtimeManifest: defaultRuntimeManifest,
		});

		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		vi.spyOn(fileSystem, 'glob').mockResolvedValue([]);

		const resolved = await (strategy as any).resolveTempOutputPath('/tmp/.eco/assets/_hmr/pages/index.123.tmp.js');
		expect(resolved).toBeNull();
	});

	describe('dependency graph selective invalidation', () => {
		it('matches returns true for dependency-hit files tied to owned entrypoints', () => {
			const watchedFiles = new Map<string, string>([
				['/tmp/src/pages/index.tsx', '/assets/__eco_dev__/pages/index.js'],
			]);
			const changedComponent = '/tmp/src/components/button.tsx';
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set(['/tmp/src/pages/index.tsx']) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === '/tmp/src/pages/index.tsx',
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			expect(strategy.matches(changedComponent)).toBe(true);
		});

		it('matches returns false for dependency-hit files not tied to owned entrypoints', () => {
			const watchedFiles = new Map<string, string>([
				['/tmp/src/pages/index.tsx', '/assets/__eco_dev__/pages/index.js'],
			]);
			const changedComponent = '/tmp/src/components/button.tsx';
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set(['/tmp/src/pages/other.tsx']) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === '/tmp/src/pages/index.tsx',
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			expect(strategy.matches(changedComponent)).toBe(false);
		});

		it('process rebuilds only affected entrypoints when dependency hits are present', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const changedComponent = '/tmp/src/components/shared.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set([entrypointA]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA || entrypointPath === entrypointB,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/assets/__eco_dev__/pages/page-a.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('process returns none when dependency hits are present but none map to React-owned watched entrypoints', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const nonReactEntrypoint = '/tmp/src/pages/other.kita.tsx';
			const changedComponent = '/tmp/src/components/shared.tsx';
			const watchedFiles = new Map<string, string>([[entrypointA, '/assets/__eco_dev__/pages/page-a.js']]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set([nonReactEntrypoint]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					ownsEntrypoint: (entrypointPath) => entrypointPath === entrypointA,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
			expect(action).toEqual({ type: 'none' });
		});

		it('process triggers a layout refresh when dependency hits only an owned layout entrypoint', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const layoutEntrypoint = '/tmp/src/layouts/base-layout.tsx';
			const changedComponent = '/tmp/src/components/app-shell.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set([layoutEntrypoint]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA ||
						entrypointPath === entrypointB ||
						entrypointPath === layoutEntrypoint,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'layout-update',
					},
				],
			});
		});

		it('process triggers a layout refresh when a dependency-hit page owns the changed file through its layout subtree', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const changedComponent = '/tmp/src/components/app-shell.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent ? new Set([entrypointA, entrypointB]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
					importServerModule: createImportServerModuleMock({
						config: {
							layouts: [
								{
									config: {
										__eco: {
											id: 'layout',
											file: '/tmp/src/layouts/base-layout.tsx',
											integration: 'react',
										},
										dependencies: {
											components: [
												{
													config: {
														__eco: {
															id: 'shell',
															file: changedComponent,
															integration: 'react',
														},
													},
												},
											],
										},
									},
								},
							],
						},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA || entrypointPath === entrypointB,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'layout-update',
					},
				],
			});
		});

		it('process falls back to all watched entrypoints when dependency graph has no hits', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const changedComponent = '/tmp/src/components/shared.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: () => new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA || entrypointPath === entrypointB,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/assets/__eco_dev__/pages/page-a.js',
						timestamp: expect.any(Number),
					},
					{
						type: 'update',
						path: '/assets/__eco_dev__/pages/page-b.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('process triggers a layout refresh on dependency-graph miss when the changed file belongs to a page layout subtree', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const changedComponent = '/tmp/src/components/app-shell.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: () => new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
					importServerModule: createImportServerModuleMock({
						config: {
							layouts: [
								{
									config: {
										__eco: {
											id: 'layout',
											file: '/tmp/src/layouts/base-layout.tsx',
											integration: 'react',
										},
										dependencies: {
											components: [
												{
													config: {
														__eco: {
															id: 'shell',
															file: changedComponent,
															integration: 'react',
														},
													},
												},
											],
										},
									},
								},
							],
						},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA || entrypointPath === entrypointB,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'layout-update',
					},
				],
			});
		});

		it('process triggers a layout refresh when the changed watched entrypoint is owned by a page layout subtree', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const changedComponent = '/tmp/src/components/app-shell.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
				[changedComponent, '/assets/_hmr/components/app-shell.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: () => new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
					importServerModule: createImportServerModuleMock({
						config: {
							layouts: [
								{
									config: {
										__eco: {
											id: 'layout',
											file: '/tmp/src/layouts/base-layout.tsx',
											integration: 'react',
										},
										dependencies: {
											components: [
												{
													config: {
														__eco: {
															id: 'shell',
															file: changedComponent,
															integration: 'react',
														},
													},
												},
											],
										},
									},
								},
							],
						},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA ||
						entrypointPath === entrypointB ||
						entrypointPath === changedComponent,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoints = vi.fn(async () => []);
			(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

			const action = await strategy.process(changedComponent);

			expect((strategy as any).bundleReactEntrypoints).not.toHaveBeenCalled();
			expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledTimes(1);
			expect((strategy as any).bundleReactEntrypoint).toHaveBeenCalledWith(
				changedComponent,
				'/assets/_hmr/components/app-shell.js',
			);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'layout-update',
					},
				],
			});
		});

		it('matches gives precedence to watched entrypoint check over dependency graph hits', () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const watchedFiles = new Map<string, string>([[entrypointA, '/assets/__eco_dev__/pages/page-a.js']]);
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === entrypointA ? new Set(['/tmp/src/pages/other.tsx']) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === entrypointA,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			expect(strategy.matches(entrypointA)).toBe(true);
		});

		it('process gives precedence to watched entrypoint check over dependency graph hits', async () => {
			const entrypointA = '/tmp/src/pages/page-a.tsx';
			const entrypointB = '/tmp/src/pages/page-b.tsx';
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
			]);

			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === entrypointA ? new Set([entrypointB]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					getDeclaredModules: () => [],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA || entrypointPath === entrypointB,
				}) as any,
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactEntrypoint = vi.fn(async () => true);

			const action = await strategy.process(entrypointA);

			expect((strategy as any).bundleReactEntrypoint).not.toHaveBeenCalled();
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/assets/__eco_dev__/pages/page-a.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});
	});

	describe('prepareColdClientGraph', () => {
		const originalNodeEnv = process.env.NODE_ENV;

		afterEach(() => {
			if (originalNodeEnv === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = originalNodeEnv;
			}
		});

		it('seeds cache hits and builds uncached route entrypoints in grouped passes', async () => {
			process.env.NODE_ENV = 'development';
			const pagesDir = '/tmp/src/pages';
			const entrypointPath = path.join(pagesDir, 'login.tsx');
			const seededPaths: string[] = [];
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getPagesDir: () => pagesDir,
					seedResolvedEntrypoint: (resolved) => {
						seededPaths.push(resolved.sourcePath);
					},
				}),
				pageMetadataCache: createPageMetadataCache(),
				runtimeManifest: defaultRuntimeManifest,
			});

			const outputPath = '/tmp/.eco/assets/_hmr/pages/login.js';
			(strategy as any).bundleReactBuildTargets = vi.fn(async () => {
				fs.mkdirSync(path.dirname(outputPath), { recursive: true });
				fs.writeFileSync(outputPath, 'bundled', 'utf8');
				return ['/assets/_hmr/pages/login.js'];
			});

			const cache = {
				appConfig: { rootDir: '/tmp' },
				manifest: {
					invalidationVersion: 'v1',
					buildInputsFingerprint: 'stable',
					entries: {},
				},
			} as any;

			await strategy.prepareColdClientGraph(cache, {
				templateRouteFilePaths: [entrypointPath],
				tryTrackInFlightEntrypoint: vi.fn(() => true),
				releaseInFlightEntrypoint: vi.fn(),
				getMissingEntrypointError: (source, output) => new Error(`missing ${source} -> ${output}`),
			});

			expect((strategy as any).bundleReactBuildTargets).toHaveBeenCalledTimes(1);
			expect(seededPaths).toContain(entrypointPath);
		});

		it('seeds persisted cache hits without invoking grouped builds', async () => {
			process.env.NODE_ENV = 'development';
			const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-graph-cache-hit-'));
			const pagesDir = path.join(rootDir, 'src', 'pages');
			fs.mkdirSync(pagesDir, { recursive: true });

			const entrypointPath = path.join(pagesDir, 'login.tsx');
			const outputPath = path.join(rootDir, '.eco', 'assets', '_hmr', 'pages', 'login.js');
			fs.writeFileSync(entrypointPath, 'export {}', 'utf8');
			fs.mkdirSync(path.dirname(outputPath), { recursive: true });
			fs.writeFileSync(outputPath, 'bundled', 'utf8');

			const seededPaths: string[] = [];
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getPagesDir: () => pagesDir,
					seedResolvedEntrypoint: (resolved) => {
						seededPaths.push(resolved.sourcePath);
					},
				}),
				pageMetadataCache: createPageMetadataCache(),
				runtimeManifest: defaultRuntimeManifest,
			});

			(strategy as any).bundleReactBuildTargets = vi.fn(async () => []);

			const cache = createDevHmrEntrypointCache({ rootDir } as any);
			setDevHmrEntrypointCacheEntry(cache, entrypointPath, {
				outputPath,
				outputUrl: '/assets/_hmr/pages/login.js',
				sourceMtimeMs: fs.statSync(entrypointPath).mtimeMs,
				builtAt: Date.now(),
			});

			await strategy.prepareColdClientGraph(cache, {
				templateRouteFilePaths: [entrypointPath],
				tryTrackInFlightEntrypoint: vi.fn(() => true),
				releaseInFlightEntrypoint: vi.fn(),
				getMissingEntrypointError: (source, output) => new Error(`missing ${source} -> ${output}`),
			});

			expect((strategy as any).bundleReactBuildTargets).not.toHaveBeenCalled();
			expect(seededPaths).toContain(entrypointPath);

			fs.rmSync(rootDir, { recursive: true, force: true });
		});
	});
});
