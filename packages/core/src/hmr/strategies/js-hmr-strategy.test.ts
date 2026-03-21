import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { JsHmrStrategy, type JsHmrContext } from './js-hmr-strategy';
import { HmrStrategyType } from '../hmr-strategy';
import { InMemoryDevGraphService, NoopDevGraphService } from '../../services/dev-graph.service.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'js-hmr-strategy-test');
const SRC_DIR = path.join(TMP_DIR, 'src');

function createMockContext(overrides: Partial<JsHmrContext> = {}): JsHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getSpecifierMap: () => new Map(),
		getDevGraphService: () => new NoopDevGraphService(),
		getDistDir: () => TMP_DIR,
		getPlugins: () => [],
		getSrcDir: () => SRC_DIR,
		getBrowserBundleService: () => ({
			bundle: async () => ({ success: true, logs: [], outputs: [] }),
		}),
		...overrides,
	};
}

describe('JsHmrStrategy', () => {
	beforeAll(() => {
		fs.mkdirSync(SRC_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	describe('type', () => {
		it('has SCRIPT type', () => {
			const context = createMockContext();
			const strategy = new JsHmrStrategy(context);
			expect(strategy.type).toBe(HmrStrategyType.SCRIPT);
		});

		it('has default priority of 25', () => {
			const context = createMockContext();
			const strategy = new JsHmrStrategy(context);
			expect(strategy.priority).toBe(25);
		});
	});

	describe('matches', () => {
		it('returns false when no watched files are registered', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'app.ts'))).toBe(false);
		});

		it('returns false for unrelated .ts files when dependency graph support is available', () => {
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDevGraphService: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.ts'))).toBe(false);
		});

		it('returns true for dependency-connected .tsx files in src directory', () => {
			const changedFile = path.join(SRC_DIR, 'component.tsx');
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(path.join(SRC_DIR, 'entry.ts'), [changedFile]);
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDevGraphService: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(changedFile)).toBe(true);
		});

		it('returns true for registered entrypoints even without dependency graph hits', () => {
			const entrypoint = path.join(SRC_DIR, 'entry.tsx');
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, '/output.js']]),
				getDevGraphService: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for .js files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'utils.js'))).toBe(true);
		});

		it('returns true for .jsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.jsx'))).toBe(true);
		});

		it('returns false for .css files', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'styles.css'))).toBe(false);
		});

		it('returns false for files outside src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches('/other/path/file.ts')).toBe(false);
		});

		it('returns false for non-extension matches', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'data.json'))).toBe(false);
			expect(strategy.matches(path.join(SRC_DIR, 'readme.md'))).toBe(false);
		});
	});

	describe('process', () => {
		it('returns none when no watched files are registered', async () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
			});
			const strategy = new JsHmrStrategy(context);

			const action = await strategy.process(path.join(SRC_DIR, 'app.ts'));

			expect(action.type).toBe('none');
		});

		it('rebuilds only dependency-connected entrypoints when graph hit exists', async () => {
			const entryA = path.join(SRC_DIR, 'entry-a.ts');
			const entryB = path.join(SRC_DIR, 'entry-b.ts');
			const depA = path.join(SRC_DIR, 'shared-a.ts');
			const setEntrypointDependenciesCalls: Array<{ entrypointPath: string; dependencies: string[] }> = [];
			let batchedEntrypoints: string[] = [];
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(entryA, [depA]);
			devGraphService.setEntrypointDependencies(entryB, [entryB]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, '/_hmr/entry-a.js'],
						[entryB, '/_hmr/entry-b.js'],
					]),
				getDevGraphService: () => ({
					supportsSelectiveInvalidation: () => devGraphService.supportsSelectiveInvalidation(),
					getDependencyEntrypoints: (filePath: string) => devGraphService.getDependencyEntrypoints(filePath),
					setEntrypointDependencies: (entrypointPath: string, dependencies: string[]) => {
						setEntrypointDependenciesCalls.push({ entrypointPath, dependencies });
						devGraphService.setEntrypointDependencies(entrypointPath, dependencies);
					},
					clearEntrypointDependencies: (entrypointPath: string) =>
						devGraphService.clearEntrypointDependencies(entrypointPath),
					getServerInvalidationVersion: () => devGraphService.getServerInvalidationVersion(),
					invalidateServerModules: (changedFiles?: string[]) =>
						devGraphService.invalidateServerModules(changedFiles),
					reset: () => devGraphService.reset(),
				}),
			});

			const strategy = new JsHmrStrategy(context) as unknown as {
				process: (filePath: string) => Promise<{ type: string; events?: unknown[] }>;
				[key: string]: unknown;
			};

			strategy.bundleEntrypoints = async (entrypoints: string[]) => {
				batchedEntrypoints = entrypoints;
				const dependencies = new Map<string, string[]>();
				for (const ep of entrypoints) {
					dependencies.set(path.resolve(ep), [ep, depA]);
				}
				return { success: true, dependencies };
			};

			strategy.processOutput = async () => {
				return { success: true, requiresReload: false };
			};

			const action = await strategy.process(depA);

			expect(batchedEntrypoints).toEqual([entryA]);
			expect(setEntrypointDependenciesCalls).toEqual([{ entrypointPath: entryA, dependencies: [entryA, depA] }]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/_hmr/entry-a.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('falls back to rebuilding all watched entrypoints when graph has no hit', async () => {
			const entryA = path.join(SRC_DIR, 'entry-a.ts');
			const entryB = path.join(SRC_DIR, 'entry-b.ts');
			const changedFile = path.join(SRC_DIR, 'new-shared.ts');
			let batchedEntrypoints: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, '/_hmr/entry-a.js'],
						[entryB, '/_hmr/entry-b.js'],
					]),
				getDevGraphService: () => new NoopDevGraphService(),
			});

			const strategy = new JsHmrStrategy(context) as unknown as {
				process: (filePath: string) => Promise<{ type: string; events?: unknown[] }>;
				[key: string]: unknown;
			};

			strategy.bundleEntrypoints = async (entrypoints: string[]) => {
				batchedEntrypoints = entrypoints;
				const dependencies = new Map<string, string[]>();
				for (const ep of entrypoints) {
					dependencies.set(path.resolve(ep), [ep]);
				}
				return { success: true, dependencies };
			};

			strategy.processOutput = async () => {
				return { success: true, requiresReload: false };
			};

			const action = await strategy.process(changedFile);

			expect(batchedEntrypoints).toEqual([entryA, entryB]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/_hmr/entry-a.js',
						timestamp: expect.any(Number),
					},
					{
						type: 'update',
						path: '/_hmr/entry-b.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('skips watched entrypoints owned by higher-priority integration strategies', async () => {
			const reactEntrypoint = path.join(SRC_DIR, 'react-page.tsx');
			const scriptEntrypoint = path.join(SRC_DIR, 'widget.script.ts');
			const changedFile = path.join(SRC_DIR, 'shared.ts');
			let batchedEntrypoints: string[] = [];
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(reactEntrypoint, [changedFile]);
			devGraphService.setEntrypointDependencies(scriptEntrypoint, [changedFile]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[reactEntrypoint, '/_hmr/react-page.js'],
						[scriptEntrypoint, '/_hmr/widget.script.js'],
					]),
				getDevGraphService: () => devGraphService,
				shouldProcessEntrypoint: (entrypointPath: string) => entrypointPath !== reactEntrypoint,
			});

			const strategy = new JsHmrStrategy(context) as unknown as {
				process: (filePath: string) => Promise<{ type: string; events?: unknown[] }>;
				[key: string]: unknown;
			};

			strategy.bundleEntrypoints = async (entrypoints: string[]) => {
				batchedEntrypoints = entrypoints;
				return { success: true, dependencies: new Map([[path.resolve(scriptEntrypoint), [scriptEntrypoint]]]) };
			};

			strategy.processOutput = async () => {
				return { success: true, requiresReload: false };
			};

			const action = await strategy.process(changedFile);

			expect(batchedEntrypoints).toEqual([scriptEntrypoint]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: '/_hmr/widget.script.js',
						timestamp: expect.any(Number),
					},
				],
			});
		});
	});
});
