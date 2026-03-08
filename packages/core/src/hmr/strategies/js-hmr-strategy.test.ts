import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { JsHmrStrategy, type JsHmrContext } from './js-hmr-strategy';
import { HmrStrategyType } from '../hmr-strategy';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'js-hmr-strategy-test');
const SRC_DIR = path.join(TMP_DIR, 'src');

function createMockContext(overrides: Partial<JsHmrContext> = {}): JsHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getSpecifierMap: () => new Map(),
		getDependencyEntrypoints: () => new Set(),
		setEntrypointDependencies: () => {},
		getDistDir: () => TMP_DIR,
		getPlugins: () => [],
		getSrcDir: () => SRC_DIR,
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
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDependencyEntrypoints: () => new Set<string>(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.ts'))).toBe(false);
		});

		it('returns true for dependency-connected .tsx files in src directory', () => {
			const changedFile = path.join(SRC_DIR, 'component.tsx');
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDependencyEntrypoints: (filePath: string) =>
					filePath === changedFile ? new Set([path.join(SRC_DIR, 'entry.ts')]) : new Set<string>(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(changedFile)).toBe(true);
		});

		it('returns true for registered entrypoints even without dependency graph hits', () => {
			const entrypoint = path.join(SRC_DIR, 'entry.tsx');
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, '/output.js']]),
				getDependencyEntrypoints: () => new Set<string>(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for .js files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDependencyEntrypoints: undefined,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'utils.js'))).toBe(true);
		});

		it('returns true for .jsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), '/output.js']]),
				getDependencyEntrypoints: undefined,
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
			const bundledEntrypoints: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, '/_hmr/entry-a.js'],
						[entryB, '/_hmr/entry-b.js'],
					]),
				getDependencyEntrypoints: (filePath: string) =>
					filePath === depA ? new Set([entryA]) : new Set<string>(),
				setEntrypointDependencies: (entrypointPath: string, dependencies: string[]) => {
					setEntrypointDependenciesCalls.push({ entrypointPath, dependencies });
				},
			});

			const strategy = new JsHmrStrategy(context) as unknown as {
				process: (filePath: string) => Promise<{ type: string; events?: unknown[] }>;
				[key: string]: unknown;
			};

			strategy.bundleEntrypoint = async (entrypointPath: string) => {
				bundledEntrypoints.push(entrypointPath);
				return { success: true, requiresReload: false, dependencies: [entrypointPath, depA] };
			};

			const action = await strategy.process(depA);

			expect(bundledEntrypoints).toEqual([entryA]);
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
			const bundledEntrypoints: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, '/_hmr/entry-a.js'],
						[entryB, '/_hmr/entry-b.js'],
					]),
				getDependencyEntrypoints: () => new Set<string>(),
			});

			const strategy = new JsHmrStrategy(context) as unknown as {
				process: (filePath: string) => Promise<{ type: string; events?: unknown[] }>;
				[key: string]: unknown;
			};

			strategy.bundleEntrypoint = async (entrypointPath: string) => {
				bundledEntrypoints.push(entrypointPath);
				return { success: true, requiresReload: false, dependencies: [entrypointPath] };
			};

			const action = await strategy.process(changedFile);

			expect(bundledEntrypoints).toEqual([entryA, entryB]);
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
	});
});
