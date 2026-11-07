import { afterEach, describe, expect, it, vi } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { ReactHmrStrategy } from './hmr-strategy.ts';
import { HmrPageMetadataCache } from './page-metadata-cache.ts';
import type { DefaultHmrContext } from '@ecopages/core/integration';

function devTransformPageUrl(relativeJsPath: string): string {
	return `/assets/__eco_dev__/pages/${relativeJsPath}`;
}

function createPageMetadataCache(
	overrides: {
		initialOwnedEntrypoints?: string[];
		getDeclaredModules?: (entrypointPath: string) => string[] | undefined;
		ownsEntrypoint?: (entrypointPath: string) => boolean;
	} = {},
): HmrPageMetadataCache {
	const cache = new HmrPageMetadataCache();
	for (const entrypointPath of overrides.initialOwnedEntrypoints ?? []) {
		cache.markOwnedEntrypoint(entrypointPath);
	}
	if (overrides.getDeclaredModules) {
		vi.spyOn(cache, 'getDeclaredModules').mockImplementation(overrides.getDeclaredModules);
	}
	if (overrides.ownsEntrypoint) {
		vi.spyOn(cache, 'ownsEntrypoint').mockImplementation(overrides.ownsEntrypoint);
	}
	return cache;
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
		getRegisteredEntrypoints: () => new Map(),
		getSrcDir: () => path.resolve('/tmp/src'),
		getLayoutsDir: () => path.resolve('/tmp/src/layouts'),
		getPagesDir: () => path.resolve('/tmp/src/pages'),
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

function registeredScriptEntrypoints(
	entries: Array<{ sourcePath: string; outputUrl: string }>,
): Map<string, { sourcePath: string; outputPath: string; outputUrl: string; role: 'script' }> {
	return new Map(
		entries.map(({ sourcePath, outputUrl }) => [
			sourcePath,
			{
				sourcePath,
				outputPath: sourcePath,
				outputUrl,
				role: 'script' as const,
			},
		]),
	);
}

function createRegisteredScriptStrategy(options: {
	scriptPath: string;
	outputUrl: string;
	watchedFiles?: Map<string, string>;
	ownsEntrypoint?: (entrypointPath: string) => boolean;
	ownedTemplateExtensions?: string[];
	allTemplateExtensions?: string[];
}): ReactHmrStrategy {
	const { scriptPath, outputUrl, watchedFiles, ownsEntrypoint, ownedTemplateExtensions, allTemplateExtensions } =
		options;

	return new ReactHmrStrategy({
		context: createMockContext({
			getWatchedFiles: () => watchedFiles ?? new Map(),
			getRegisteredEntrypoints: () => registeredScriptEntrypoints([{ sourcePath: scriptPath, outputUrl }]),
		}),
		pageMetadataCache: createPageMetadataCache({
			ownsEntrypoint,
		}),
		ownedTemplateExtensions,
		allTemplateExtensions,
	});
}

describe('ReactHmrStrategy', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('claims owned React entrypoints for dev transform plugin selection', () => {
		const pagePath = path.resolve('/tmp/src/pages/index.tsx');
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === pagePath,
			}),
		});

		expect(strategy.ownsDevTransformEntrypoint(pagePath)).toBe(true);
	});

	it('claims page entrypoints for dev transform even before SSR marks them owned', () => {
		const pagePath = path.resolve('/tmp/src/pages/dashboard.tsx');
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache(),
		});

		expect(strategy.ownsDevTransformEntrypoint(pagePath)).toBe(true);
	});

	it('claims registered script entrypoints that need React transforms', () => {
		const scriptPath = path.resolve('/tmp/src/components/counter.tsx');
		const strategy = createRegisteredScriptStrategy({
			scriptPath,
			outputUrl: '/assets/__eco_dev__/components/counter.js',
			ownedTemplateExtensions: ['.eco.tsx'],
			allTemplateExtensions: ['.eco.tsx', '.tsx'],
		});

		expect(strategy.ownsDevTransformEntrypoint(scriptPath)).toBe(true);
	});

	it('does not claim registered script entrypoints that are not React entrypoints', () => {
		const scriptPath = path.resolve('/tmp/src/layouts/base-layout.ts');
		const strategy = createRegisteredScriptStrategy({
			scriptPath,
			outputUrl: '/assets/__eco_dev__/layouts/base-layout.js',
		});

		expect(strategy.ownsDevTransformEntrypoint(scriptPath)).toBe(false);
	});

	it('process returns none when no entrypoints are registered yet', async () => {
		const pagePath = path.resolve('/tmp/src/pages/index.tsx');
		const strategy = new ReactHmrStrategy({
			context: createMockContext(),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === pagePath,
			}),
		});

		await expect(strategy.process(pagePath)).resolves.toEqual({ type: 'none' });
	});

	it('matches route templates only when their configured extension is owned by React', () => {
		const watchedFiles = new Map<string, string>([
			[path.resolve('/tmp/src/pages/react-lab.tsx'), '/assets/__eco_dev__/pages/react-lab.js'],
		]);
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				ownsEntrypoint: (entrypointPath) => entrypointPath === path.resolve('/tmp/src/pages/react-lab.tsx'),
			}),
			ownedTemplateExtensions: ['.tsx', '.react.tsx'],
			allTemplateExtensions: ['.tsx', '.react.tsx', '.kita.tsx', '.lit.tsx'],
		});

		expect(strategy.matches(path.resolve('/tmp/src/pages/index.kita.tsx'))).toBe(false);
		expect(strategy.matches(path.resolve('/tmp/src/layouts/base-layout.lit.tsx'))).toBe(false);
		expect(strategy.matches(path.resolve('/tmp/src/pages/react-lab.tsx'))).toBe(true);
		expect(strategy.matches(path.resolve('/tmp/src/pages/react-lab.react.tsx'))).toBe(true);
		expect(strategy.matches(path.resolve('/tmp/src/components/widget.tsx'))).toBe(true);
		expect(strategy.matches(path.resolve('/tmp/src/components/widget.kita.tsx'))).toBe(false);
		expect(strategy.matches(path.resolve('/tmp/src/views/explicit-team-view.kita.tsx'))).toBe(false);
	});

	describe('folders that share the pages or layouts folder name prefix', () => {
		it('does not treat a pages sibling folder as route templates', () => {
			const strategy = new ReactHmrStrategy({
				context: createMockContext(),
				pageMetadataCache: new HmrPageMetadataCache(),
				ownedTemplateExtensions: ['.react.tsx'],
				allTemplateExtensions: ['.tsx', '.react.tsx'],
			});

			expect(strategy.matches(path.resolve('/tmp/src/pages/a.tsx'))).toBe(false);
			expect(strategy.matches(path.resolve('/tmp/src/pages-old/a.tsx'))).toBe(true);
		});

		it('does not treat a pages sibling folder file as a Page entrypoint', async () => {
			const importServerModule = createImportServerModuleMock({ config: {} });
			const strategy = new ReactHmrStrategy({
				context: createMockContext({ importServerModule }),
				pageMetadataCache: new HmrPageMetadataCache(),
			});

			await strategy.createDevTransformPlugins(path.resolve('/tmp/src/pages-old/a.tsx'));

			expect(importServerModule).not.toHaveBeenCalled();
		});

		it('does not treat a layouts sibling folder file as a layout', async () => {
			const pageEntrypoint = path.resolve('/tmp/src/pages/index.tsx');
			const createStrategy = () => {
				const pageMetadataCache = new HmrPageMetadataCache();
				pageMetadataCache.markOwnedEntrypoint(pageEntrypoint);
				return new ReactHmrStrategy({
					context: createMockContext({
						getWatchedFiles: () => new Map([[pageEntrypoint, devTransformPageUrl('index.js')]]),
					}),
					pageMetadataCache,
				});
			};
			const layoutUpdate = { type: 'broadcast', events: [{ type: 'layout-update' }] };

			await expect(createStrategy().process(path.resolve('/tmp/src/layouts/a.tsx'))).resolves.toEqual(
				layoutUpdate,
			);
			await expect(createStrategy().process(path.resolve('/tmp/src/layouts-v2/a.tsx'))).resolves.not.toEqual(
				layoutUpdate,
			);
		});
	});

	it.each([
		{
			label: 'without watch ownership',
			ownsEntrypoint: () => false,
			watchedFiles: undefined as Map<string, string> | undefined,
		},
		{
			label: 'with watch ownership',
			ownsEntrypoint: (entrypointPath: string) =>
				entrypointPath === path.resolve('/tmp/src/components/radiant-counter.tsx'),
			watchedFiles: new Map([
				[
					path.resolve('/tmp/src/components/radiant-counter.tsx'),
					'/assets/__eco_dev__/components/radiant-counter.js',
				],
			]),
		},
	])('defers registered script entrypoints to JsHmrStrategy ($label)', ({ ownsEntrypoint, watchedFiles }) => {
		const scriptPath = path.resolve('/tmp/src/components/radiant-counter.tsx');
		const strategy = createRegisteredScriptStrategy({
			scriptPath,
			outputUrl: '/assets/__eco_dev__/components/radiant-counter.js',
			watchedFiles,
			ownsEntrypoint,
		});

		expect(strategy.matches(scriptPath)).toBe(false);
	});

	it('createDevTransformPlugins loads server-side page metadata through the shared HMR server-module path', async () => {
		const importServerModule = createImportServerModuleMock({
			config: {
				requires: ['react', './client-entry.ts'],
			},
		});
		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				importServerModule,
			}),
			pageMetadataCache: createPageMetadataCache(),
		});

		await strategy.createDevTransformPlugins(path.resolve('/tmp/src/pages/index.tsx'));

		expect(importServerModule).toHaveBeenCalledWith(path.resolve('/tmp/src/pages/index.tsx'));
	});

	it('process only broadcasts the changed watched entrypoint update', async () => {
		const changedEntrypoint = path.resolve('/tmp/src/pages/react-lab.react.tsx');
		const otherEntrypoint = path.resolve('/tmp/src/pages/react-content.mdx');
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
			}),
			ownedTemplateExtensions: ['.react.tsx'],
			allTemplateExtensions: ['.react.tsx', '.mdx', '.kita.tsx'],
		});

		const action = await strategy.process(changedEntrypoint);

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
		const entrypointA = path.resolve('/tmp/src/pages/react-lab.react.tsx');
		const entrypointB = path.resolve('/tmp/src/pages/react-content.mdx');
		const changedDependency = path.resolve('/tmp/src/components/theme-toggle.react.tsx');
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
			}),
			getMdxLoaderPlugin: () => ({ name: 'mdx-loader', setup: () => {} }),
			ownedTemplateExtensions: ['.react.tsx', '.mdx'],
			allTemplateExtensions: ['.react.tsx', '.mdx', '.kita.tsx'],
		});

		const action = await strategy.process(changedDependency);

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
		const changedEntrypoint = path.resolve('/tmp/src/pages/index.tsx');
		const watchedFiles = new Map<string, string>([[changedEntrypoint, devTransformPageUrl('index.js')]]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				ownsEntrypoint: (entrypointPath) => entrypointPath === changedEntrypoint,
				initialOwnedEntrypoints: [changedEntrypoint, path.resolve('/tmp/src/pages/dashboard.tsx')],
			}),
		});

		const action = await strategy.process(changedEntrypoint);

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
		const changedEntrypoint = path.resolve('/tmp/src/pages/docs/index.tsx');
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
			}),
		});

		const action = await strategy.process(changedEntrypoint);

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

	it('process broadcasts dev-transform updates for grouped non-page entrypoints', async () => {
		const pageEntrypoint = path.resolve('/tmp/src/pages/index.tsx');
		const islandEntrypoint = path.resolve('/tmp/src/components/counter.tsx');
		const watchedFiles = new Map<string, string>([
			[pageEntrypoint, '/assets/__eco_dev__/pages/index.js'],
			[islandEntrypoint, '/assets/__eco_dev__/components/counter.js'],
		]);

		const strategy = new ReactHmrStrategy({
			context: createMockContext({
				getWatchedFiles: () => watchedFiles,
			}),
			pageMetadataCache: createPageMetadataCache({
				getDeclaredModules: () => [],
				initialOwnedEntrypoints: [pageEntrypoint, path.resolve('/tmp/src/pages/dashboard.tsx')],
			}),
		});

		const action = await strategy.process(path.resolve('/tmp/src/components/theme-toggle.tsx'));

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
					path: '/assets/__eco_dev__/components/counter.js',
					timestamp: expect.any(Number),
				},
			],
		});
	});

	describe('dependency graph selective invalidation', () => {
		it('matches returns true for dependency-hit files tied to owned entrypoints', () => {
			const watchedFiles = new Map<string, string>([
				[path.resolve('/tmp/src/pages/index.tsx'), '/assets/__eco_dev__/pages/index.js'],
			]);
			const changedComponent = path.resolve('/tmp/src/components/button.tsx');
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent
								? new Set([path.resolve('/tmp/src/pages/index.tsx')])
								: new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === path.resolve('/tmp/src/pages/index.tsx'),
				}),
			});

			expect(strategy.matches(changedComponent)).toBe(true);
		});

		it('matches returns false for dependency-hit files not tied to owned entrypoints', () => {
			const watchedFiles = new Map<string, string>([
				[path.resolve('/tmp/src/pages/index.tsx'), '/assets/__eco_dev__/pages/index.js'],
			]);
			const changedComponent = path.resolve('/tmp/src/components/button.tsx');
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === changedComponent
								? new Set([path.resolve('/tmp/src/pages/other.tsx')])
								: new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === path.resolve('/tmp/src/pages/index.tsx'),
				}),
			});

			expect(strategy.matches(changedComponent)).toBe(false);
		});

		it('process rebuilds only affected entrypoints when dependency hits are present', async () => {
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const entrypointB = path.resolve('/tmp/src/pages/page-b.tsx');
			const changedComponent = path.resolve('/tmp/src/components/shared.tsx');
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
				}),
			});

			const action = await strategy.process(changedComponent);

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
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const nonReactEntrypoint = path.resolve('/tmp/src/pages/other.kita.tsx');
			const changedComponent = path.resolve('/tmp/src/components/shared.tsx');
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
				}),
			});

			const action = await strategy.process(changedComponent);

			expect(action).toEqual({ type: 'none' });
		});

		it('process triggers a layout refresh when dependency hits only an owned layout entrypoint', async () => {
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const entrypointB = path.resolve('/tmp/src/pages/page-b.tsx');
			const layoutEntrypoint = path.resolve('/tmp/src/layouts/base-layout.tsx');
			const changedComponent = path.resolve('/tmp/src/components/app-shell.tsx');
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
				}),
			});

			const action = await strategy.process(changedComponent);

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
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const entrypointB = path.resolve('/tmp/src/pages/page-b.tsx');
			const changedComponent = path.resolve('/tmp/src/components/shared.tsx');
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
				}),
			});

			const action = await strategy.process(changedComponent);

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

		it('process refreshes the pages that import a changed watched entrypoint', async () => {
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const entrypointB = path.resolve('/tmp/src/pages/page-b.tsx');
			const changedComponent = path.resolve('/tmp/src/components/app-shell.tsx');
			const watchedFiles = new Map<string, string>([
				[entrypointA, '/assets/__eco_dev__/pages/page-a.js'],
				[entrypointB, '/assets/__eco_dev__/pages/page-b.js'],
				[changedComponent, '/assets/__eco_dev__/components/app-shell.js'],
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
					initialOwnedEntrypoints: [entrypointA, entrypointB],
					ownsEntrypoint: (entrypointPath) =>
						entrypointPath === entrypointA ||
						entrypointPath === entrypointB ||
						entrypointPath === changedComponent,
				}),
			});

			const action = await strategy.process(changedComponent);

			expect(action).toEqual({
				type: 'broadcast',
				events: expect.arrayContaining([
					{ type: 'update', path: '/assets/__eco_dev__/pages/page-a.js', timestamp: expect.any(Number) },
					{
						type: 'update',
						path: '/assets/__eco_dev__/components/app-shell.js',
						timestamp: expect.any(Number),
					},
				]),
			});
			expect(JSON.stringify(action)).not.toContain('page-b.js');
		});
		it('matches gives precedence to watched entrypoint check over dependency graph hits', () => {
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const watchedFiles = new Map<string, string>([[entrypointA, '/assets/__eco_dev__/pages/page-a.js']]);
			const strategy = new ReactHmrStrategy({
				context: createMockContext({
					getWatchedFiles: () => watchedFiles,
					getEntrypointDependencyGraph: () => ({
						supportsSelectiveInvalidation: () => true,
						getDependencyEntrypoints: (filePath: string) =>
							filePath === entrypointA ? new Set([path.resolve('/tmp/src/pages/other.tsx')]) : new Set(),
						setEntrypointDependencies: () => {},
						clearEntrypointDependencies: () => {},
						reset: () => {},
					}),
				}),
				pageMetadataCache: createPageMetadataCache({
					ownsEntrypoint: (entrypointPath) => entrypointPath === entrypointA,
				}),
			});

			expect(strategy.matches(entrypointA)).toBe(true);
		});

		it('process gives precedence to watched entrypoint check over dependency graph hits', async () => {
			const entrypointA = path.resolve('/tmp/src/pages/page-a.tsx');
			const entrypointB = path.resolve('/tmp/src/pages/page-b.tsx');
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
				}),
			});

			const action = await strategy.process(entrypointA);

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
});
