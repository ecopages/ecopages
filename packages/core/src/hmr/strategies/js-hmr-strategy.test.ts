import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { JsHmrStrategy, type JsHmrContext } from './js-hmr-strategy';
import { HmrStrategyType } from '../hmr-strategy';
import { DEV_TRANSFORM_URL_PREFIX } from '../../dev/transform-server/dev-transform-url.ts';
import { InMemoryDevGraphService, NoopDevGraphService } from '../../services/runtime-state/dev-graph.service.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'js-hmr-strategy-test');
const SRC_DIR = path.join(TMP_DIR, 'src');

function devTransformUrl(relativeJsPath: string): string {
	return `${DEV_TRANSFORM_URL_PREFIX}/${relativeJsPath}`;
}

function createMockContext(overrides: Partial<JsHmrContext> = {}): JsHmrContext {
	return {
		getWatchedFiles: () => new Map(),
		getRegisteredEntrypoints: () => new Map(),
		getEntrypointDependencyGraph: () => new NoopDevGraphService(),
		getSrcDir: () => SRC_DIR,
		getPagesDir: () => path.join(SRC_DIR, 'pages'),
		getLayoutsDir: () => path.join(SRC_DIR, 'layouts'),
		getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
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

		it('returns true for unrelated .ts files when watched entrypoints exist', () => {
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.ts'))).toBe(true);
		});

		it('returns true for dependency-connected .tsx files in src directory', () => {
			const changedFile = path.join(SRC_DIR, 'component.tsx');
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(path.join(SRC_DIR, 'entry.ts'), [changedFile]);
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(changedFile)).toBe(true);
		});

		it('returns true for registered entrypoints even without dependency graph hits', () => {
			const entrypoint = path.join(SRC_DIR, 'entry.tsx');
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('entry.js')]]),
				getEntrypointDependencyGraph: () => devGraphService,
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for registered script entrypoints that share an integration template extension', () => {
			const entrypoint = path.join(SRC_DIR, 'components', 'widget.script.tsx');
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('components/widget.script.js')]]),
				getEntrypointDependencyGraph: () => devGraphService,
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns true for registered script entrypoints regardless of filename', () => {
			const entrypoint = path.join(SRC_DIR, 'components', 'radiant-counter.tsx');
			const devGraphService = new InMemoryDevGraphService();
			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, devTransformUrl('components/radiant-counter.js')]]),
				getEntrypointDependencyGraph: () => devGraphService,
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(true);
		});

		it('returns false for unregistered files when watchedFiles is empty', () => {
			const entrypoint = path.join(SRC_DIR, 'components', 'radiant-counter.tsx');
			const context = createMockContext({
				getWatchedFiles: () => new Map(),
				getTemplateExtensions: () => ['.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(entrypoint)).toBe(false);
		});

		it('returns true for .js files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'utils.js'))).toBe(true);
		});

		it('returns true for .jsx files in src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'component.jsx'))).toBe(true);
		});

		it('returns false for .css files', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'styles.css'))).toBe(false);
		});

		it('returns false for files outside src directory', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches('/other/path/file.ts')).toBe(false);
		});

		it('returns false for integration-owned route template files', () => {
			const pagesDir = path.join(SRC_DIR, 'pages');
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
				getPagesDir: () => pagesDir,
				getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(pagesDir, 'index.kita.tsx'))).toBe(false);
			expect(strategy.matches(path.join(pagesDir, 'home.react.tsx'))).toBe(false);
		});

		it('returns false for integration-owned server templates outside pages and layouts', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
				getTemplateExtensions: () => ['.kita.tsx', '.react.tsx'],
			});
			const strategy = new JsHmrStrategy(context);

			expect(strategy.matches(path.join(SRC_DIR, 'views', 'explicit-team-view.kita.tsx'))).toBe(false);
		});

		it('returns false for non-extension matches', () => {
			const context = createMockContext({
				getWatchedFiles: () => new Map([[path.join(SRC_DIR, 'entry.ts'), devTransformUrl('entry.js')]]),
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

		it('invalidates only dependency-connected dev-transform entrypoints when graph hit exists', async () => {
			const entryA = path.join(SRC_DIR, 'entry-a.ts');
			const entryB = path.join(SRC_DIR, 'entry-b.ts');
			const depA = path.join(SRC_DIR, 'shared-a.ts');
			const invalidated: string[] = [];
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(entryA, [depA]);
			devGraphService.setEntrypointDependencies(entryB, [entryB]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, devTransformUrl('entry-a.js')],
						[entryB, devTransformUrl('entry-b.js')],
					]),
				getEntrypointDependencyGraph: () => devGraphService,
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
			const entryA = path.join(SRC_DIR, 'entry-a.ts');
			const entryB = path.join(SRC_DIR, 'entry-b.ts');
			const changedFile = path.join(SRC_DIR, 'new-shared.ts');
			const invalidated: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[entryA, devTransformUrl('entry-a.js')],
						[entryB, devTransformUrl('entry-b.js')],
					]),
				getEntrypointDependencyGraph: () => new NoopDevGraphService(),
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
			const reactEntrypoint = path.join(SRC_DIR, 'react-page.tsx');
			const scriptEntrypoint = path.join(SRC_DIR, 'widget.script.ts');
			const changedFile = path.join(SRC_DIR, 'shared.ts');
			const invalidated: string[] = [];
			const devGraphService = new InMemoryDevGraphService();
			devGraphService.setEntrypointDependencies(reactEntrypoint, [changedFile]);
			devGraphService.setEntrypointDependencies(scriptEntrypoint, [changedFile]);

			const context = createMockContext({
				getWatchedFiles: () =>
					new Map([
						[reactEntrypoint, devTransformUrl('react-page.js')],
						[scriptEntrypoint, devTransformUrl('widget.script.js')],
					]),
				getEntrypointDependencyGraph: () => devGraphService,
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

		it('ignores legacy disk HMR URLs', async () => {
			const entrypoint = path.join(SRC_DIR, 'entry.ts');
			const invalidated: string[] = [];

			const context = createMockContext({
				getWatchedFiles: () => new Map([[entrypoint, '/assets/_hmr/entry.js']]),
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
