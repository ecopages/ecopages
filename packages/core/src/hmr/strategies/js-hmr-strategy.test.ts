import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { JsHmrStrategy, type JsHmrContext } from './js-hmr-strategy';
import { HmrStrategyType } from '../hmr-strategy';
import { DEV_TRANSFORM_URL_PREFIX } from '../../dev/transform-server/dev-transform-url.ts';
import {
	InMemoryEntrypointDependencyGraph,
	NoopEntrypointDependencyGraph,
} from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;
let srcDir: string;

function devTransformUrl(relativeJsPath: string): string {
	return `${DEV_TRANSFORM_URL_PREFIX}/${relativeJsPath}`;
}

function createMockContext(overrides: Partial<JsHmrContext> = {}): JsHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getRegisteredEntrypoints: () => new Map(),
		getEntrypointDependencyGraph: () => new NoopEntrypointDependencyGraph(),
		getSrcDir: () => srcDir,
		getPagesDir: () => path.join(srcDir, 'pages'),
		getLayoutsDir: () => path.join(srcDir, 'layouts'),
		getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
		...overrides,
	};
}

describe('JsHmrStrategy', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'js-hmr-strategy-test-'));
		srcDir = path.join(tmpDir, 'src');
		fs.mkdirSync(srcDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
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

			expect(strategy.matches(path.join(srcDir, 'app.ts'))).toBe(false);
		});

		it('returns false for .ts files no browser module imports when the graph is selective', () => {
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			dependencyGraph.setEntrypointDependencies(path.join(srcDir, 'entry.ts'), []);
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => dependencyGraph,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'pages', 'classic', 'greeting.ts'))).toBe(false);
		});

		it('returns true for unrelated .ts files when the graph cannot invalidate selectively', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => new NoopEntrypointDependencyGraph(),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'component.ts'))).toBe(true);
		});

		it('returns true for dependency-connected .tsx files in src directory', () => {
			const changedFile = path.join(srcDir, 'component.tsx');
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			dependencyGraph.setEntrypointDependencies(path.join(srcDir, 'entry.ts'), [changedFile]);
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => dependencyGraph,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(changedFile)).toBe(true);
		});

		it('returns true for registered entrypoints even without dependency graph hits', () => {
			const entrypoint = path.join(srcDir, 'entry.tsx');
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => dependencyGraph,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for registered script entrypoints that share an integration template extension', () => {
			const entrypoint = path.join(srcDir, 'components', 'widget.script.tsx');
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('components/widget.script.js')]]),
				getEntrypointDependencyGraph: () => dependencyGraph,
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for registered script entrypoints regardless of filename', () => {
			const entrypoint = path.join(srcDir, 'components', 'radiant-counter.tsx');
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('components/radiant-counter.js')]]),
				getEntrypointDependencyGraph: () => dependencyGraph,
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns false for unregistered files when watchedFiles is empty', () => {
			const entrypoint = path.join(srcDir, 'components', 'radiant-counter.tsx');
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(false);
		});

		it('returns true for .js files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'utils.js'))).toBe(true);
		});

		it('returns true for .jsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'component.jsx'))).toBe(true);
		});

		it('returns false for .css files', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'styles.css'))).toBe(false);
		});

		it('returns false for files outside src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches('/other/path/file.ts')).toBe(false);
		});

		it('returns false for integration-owned route template files', () => {
			const pagesDir = path.join(srcDir, 'pages');
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
				getPagesDir: () => pagesDir,
				getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(pagesDir, 'index.kita.tsx'))).toBe(false);
			expect(strategy.matches(path.join(pagesDir, 'home.react.tsx'))).toBe(false);
		});

		it('returns false for integration-owned server templates outside pages and layouts', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
				getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'views', 'explicit-team-view.kita.tsx'))).toBe(false);
		});

		it('returns false for non-extension matches', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(srcDir, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(srcDir, 'data.json'))).toBe(false);
			expect(strategy.matches(path.join(srcDir, 'readme.md'))).toBe(false);
		});
	});

	describe('process', () => {
		it('returns none when no watched files are registered', async () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
			});
			const strategy = new JsHmrStrategy(context);

			const action = await strategy.process(path.join(srcDir, 'app.ts'));

			expect(action.type).toBe('none');
		});

		it('invalidates only dependency-connected dev-transform entrypoints when graph hit exists', async () => {
			const entryA = path.join(srcDir, 'entry-a.ts');
			const entryB = path.join(srcDir, 'entry-b.ts');
			const depA = path.join(srcDir, 'shared-a.ts');
			const invalidated: string[] = [];
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			dependencyGraph.setEntrypointDependencies(entryA, [depA]);
			dependencyGraph.setEntrypointDependencies(entryB, [entryB]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, devTransformUrl('entry-a.js')],
						[entryB, devTransformUrl('entry-b.js')],
					]),
				getEntrypointDependencyGraph: () => dependencyGraph,
				invalidateDevTransformSource: (sourcePath) => {
					invalidated.push(sourcePath);
				},
			});

			const strategy = new JsHmrStrategy(context);
			const action = await strategy.process(depA);

			expect(invalidated).toEqual([path.resolve(entryA)]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: devTransformUrl('entry-a.js'),
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('falls back to invalidating all watched dev-transform entrypoints when graph has no hit', async () => {
			const entryA = path.join(srcDir, 'entry-a.ts');
			const entryB = path.join(srcDir, 'entry-b.ts');
			const changedFile = path.join(srcDir, 'new-shared.ts');
			const invalidated: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, devTransformUrl('entry-a.js')],
						[entryB, devTransformUrl('entry-b.js')],
					]),
				getEntrypointDependencyGraph: () => new NoopEntrypointDependencyGraph(),
				invalidateDevTransformSource: (sourcePath) => {
					invalidated.push(sourcePath);
				},
			});

			const strategy = new JsHmrStrategy(context);
			const action = await strategy.process(changedFile);

			expect(invalidated).toEqual([path.resolve(entryA), path.resolve(entryB)]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: devTransformUrl('entry-a.js'),
						timestamp: expect.any(Number),
					},
					{
						type: 'update',
						path: devTransformUrl('entry-b.js'),
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('skips watched entrypoints owned by higher-priority integration strategies', async () => {
			const reactEntrypoint = path.join(srcDir, 'react-page.tsx');
			const scriptEntrypoint = path.join(srcDir, 'widget.script.ts');
			const changedFile = path.join(srcDir, 'shared.ts');
			const invalidated: string[] = [];
			const dependencyGraph = new InMemoryEntrypointDependencyGraph();
			dependencyGraph.setEntrypointDependencies(reactEntrypoint, [changedFile]);
			dependencyGraph.setEntrypointDependencies(scriptEntrypoint, [changedFile]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[reactEntrypoint, devTransformUrl('react-page.js')],
						[scriptEntrypoint, devTransformUrl('widget.script.js')],
					]),
				getEntrypointDependencyGraph: () => dependencyGraph,
				shouldProcessEntrypoint: (entrypointPath: string) => entrypointPath !== reactEntrypoint,
				invalidateDevTransformSource: (sourcePath) => {
					invalidated.push(sourcePath);
				},
			});

			const strategy = new JsHmrStrategy(context);
			const action = await strategy.process(changedFile);

			expect(invalidated).toEqual([path.resolve(scriptEntrypoint)]);
			expect(action).toEqual({
				type: 'broadcast',
				events: [
					{
						type: 'update',
						path: devTransformUrl('widget.script.js'),
						timestamp: expect.any(Number),
					},
				],
			});
		});

		it('ignores non-dev-transform module URLs', async () => {
			const entrypoint = path.join(srcDir, 'entry.ts');
			const invalidated: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, '/assets/built/entry.js']]),
				invalidateDevTransformSource: (sourcePath) => {
					invalidated.push(sourcePath);
				},
			});

			const strategy = new JsHmrStrategy(context);
			const action = await strategy.process(entrypoint);

			expect(invalidated).toEqual([]);
			expect(action).toEqual({ type: 'none' });
		});
	});
});
