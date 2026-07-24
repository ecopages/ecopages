import { describe, expect, it, beforeEach } from 'vitest';
import path from 'node:path';
import { HmrStrategyType } from '@ecopages/core/hmr/hmr-strategy';
import { EcopagesJsxHmrStrategy } from './ecopages-jsx-hmr-strategy.ts';
import {
	getEjsxHmrOwnership,
	mergeEjsxHmrOwnership,
	publishEjsxHmrOwnership,
	resetEjsxHmrOwnership,
	updateEjsxHmrOwnership,
} from './ecopages-jsx-hmr-ownership.ts';
import type { EcoComponent, EcoComponentConfig, ResolvedHmrEntrypoint } from '@ecopages/core';

const SRC_DIR = '/test/project/src';
const PAGES_DIR = '/test/project/src/pages';
const LAYOUTS_DIR = '/test/project/src/layouts';
const INCLUDES_DIR = '/test/project/src/includes';
const COMPONENTS_DIR = '/test/project/src/components';
const TEMPLATE_EXTENSIONS = ['.tsx', '.mdx'];

function makeConfig(file: string, extras: Partial<EcoComponentConfig> = {}): EcoComponentConfig {
	return {
		__eco: {
			id: `id-${file}`,
			file,
			integration: 'ecopages-jsx',
		},
		...extras,
	};
}

function makeContext(
	overrides: Partial<{
		registeredEntrypoints: Map<string, ResolvedHmrEntrypoint>;
		srcDir: string;
		pagesDir: string;
		layoutsDir: string;
		includesDir: string;
		templateExtensions: string[];
	}> = {},
) {
	const defaults = {
		registeredEntrypoints: new Map<string, ResolvedHmrEntrypoint>(),
		srcDir: SRC_DIR,
		pagesDir: PAGES_DIR,
		layoutsDir: LAYOUTS_DIR,
		includesDir: INCLUDES_DIR,
		templateExtensions: TEMPLATE_EXTENSIONS,
	};
	const merged = { ...defaults, ...overrides };
	return {
		getRegisteredEntrypoints: () => merged.registeredEntrypoints,
		getSrcDir: () => merged.srcDir,
		getPagesDir: () => merged.pagesDir,
		getLayoutsDir: () => merged.layoutsDir,
		getIncludesDir: () => merged.includesDir,
		getTemplateExtensions: () => merged.templateExtensions,
	};
}

function registeredScript(sourcePath: string, outputUrl: string): ResolvedHmrEntrypoint {
	return {
		sourcePath,
		outputPath: sourcePath,
		outputUrl,
		role: 'script',
	};
}

function makeComponent(file: string, config: Partial<EcoComponentConfig> = {}): EcoComponent {
	const fn = (() => undefined) as unknown as EcoComponent;
	(fn as { config?: EcoComponentConfig }).config = makeConfig(file, config);
	return fn;
}

describe('EcopagesJsxHmrStrategy', () => {
	beforeEach(() => {
		resetEjsxHmrOwnership();
	});

	it('has INTEGRATION priority', () => {
		const strategy = new EcopagesJsxHmrStrategy(makeContext());
		expect(strategy.priority).toBe(HmrStrategyType.INTEGRATION);
		expect(strategy.type).toBe(HmrStrategyType.INTEGRATION);
	});

	describe('matches()', () => {
		it('matches page files with a JSX template extension', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(`${PAGES_DIR}/index.tsx`)).toBe(true);
			expect(strategy.matches(`${PAGES_DIR}/docs/[...slug]/index.tsx`)).toBe(true);
			expect(strategy.matches(`${PAGES_DIR}/about.mdx`)).toBe(true);
		});

		it('matches layout files with a JSX template extension', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(`${LAYOUTS_DIR}/base-layout.tsx`)).toBe(true);
		});

		it('does not match page or layout files with non-JSX extensions', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(`${PAGES_DIR}/notes.md`)).toBe(false);
		});

		it('does not match include template files', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(`${INCLUDES_DIR}/head.tsx`)).toBe(false);
		});

		it('does not match files outside srcDir', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches('/other/path/file.tsx')).toBe(false);
		});

		it('does not match files outside pages/layouts when not in the active render tree', () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(`${COMPONENTS_DIR}/orphan.tsx`)).toBe(false);
		});

		it('does not match registered script entrypoints', () => {
			const scriptPath = `${COMPONENTS_DIR}/copy-for-llm/copy-for-llm.script.tsx`;
			const strategy = new EcopagesJsxHmrStrategy(
				makeContext({
					registeredEntrypoints: new Map([
						[
							path.resolve(scriptPath),
							registeredScript(path.resolve(scriptPath), '/assets/__eco_dev__/script.js'),
						],
					]),
				}),
			);
			expect(strategy.matches(scriptPath)).toBe(false);
		});

		it('does not match registered page entrypoints', () => {
			const pagePath = `${PAGES_DIR}/index.tsx`;
			const strategy = new EcopagesJsxHmrStrategy(
				makeContext({
					registeredEntrypoints: new Map([
						[
							path.resolve(pagePath),
							{
								sourcePath: path.resolve(pagePath),
								outputPath: path.resolve(pagePath),
								outputUrl: '/assets/__eco_dev__/pages/index.js',
								role: 'page',
							},
						],
					]),
				}),
			);
			expect(strategy.matches(pagePath)).toBe(false);
		});

		it('matches files that appear in the active render tree', () => {
			const componentFile = `${COMPONENTS_DIR}/copy-for-llm/index.tsx`;
			const component = makeComponent(componentFile);
			updateEjsxHmrOwnership([component]);

			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(componentFile)).toBe(true);
		});

		it('matches layout files referenced by a page in the active render tree', () => {
			const layoutFile = `${LAYOUTS_DIR}/base-layout.tsx`;
			const pageFile = `${PAGES_DIR}/index.tsx`;

			const layoutComponent = makeComponent(layoutFile);
			const pageComponent = makeComponent(pageFile, {
				layouts: [layoutComponent],
			});
			updateEjsxHmrOwnership([pageComponent]);

			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(layoutFile)).toBe(true);
		});

		it('matches nested dependency components in the active render tree', () => {
			const nestedFile = `${COMPONENTS_DIR}/breadcrumb/breadcrumb.tsx`;
			const rootFile = `${COMPONENTS_DIR}/docs-bar/index.tsx`;

			const nestedComponent = makeComponent(nestedFile);
			const rootComponent = makeComponent(rootFile, {
				dependencies: { components: [nestedComponent] },
			});
			updateEjsxHmrOwnership([rootComponent]);

			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			expect(strategy.matches(nestedFile)).toBe(true);
		});
	});

	describe('process()', () => {
		it('broadcasts a layout-update event with the changed file path and timestamp', async () => {
			const strategy = new EcopagesJsxHmrStrategy(makeContext());
			const filePath = `${PAGES_DIR}/index.tsx`;

			const action = await strategy.process(filePath);

			expect(action.type).toBe('broadcast');
			expect(action.events).toEqual([
				{
					type: 'layout-update',
					path: filePath,
					timestamp: expect.any(Number),
				},
			]);
		});
	});
});

describe('ecopages-jsx-hmr-ownership', () => {
	beforeEach(() => {
		resetEjsxHmrOwnership();
	});

	it('starts with an empty ownership set', () => {
		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.size).toBe(0);
		expect(state.hash).toBe('');
	});

	it('records the __eco.file of a single root component', () => {
		const component = makeComponent(`${COMPONENTS_DIR}/copy-for-llm/index.tsx`);
		updateEjsxHmrOwnership([component]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(`${COMPONENTS_DIR}/copy-for-llm/index.tsx`)).toBe(true);
	});

	it('walks nested dependencies.components[*].config.__eco.file', () => {
		const nested = makeComponent(`${COMPONENTS_DIR}/breadcrumb/breadcrumb.tsx`);
		const root = makeComponent(`${COMPONENTS_DIR}/docs-bar/index.tsx`, {
			dependencies: { components: [nested] },
		});
		updateEjsxHmrOwnership([root]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(`${COMPONENTS_DIR}/docs-bar/index.tsx`)).toBe(true);
		expect(state.fileOwners.has(`${COMPONENTS_DIR}/breadcrumb/breadcrumb.tsx`)).toBe(true);
	});

	it('walks layouts[*].config.__eco.file', () => {
		const layout = makeComponent(`${LAYOUTS_DIR}/base-layout.tsx`);
		const page = makeComponent(`${PAGES_DIR}/index.tsx`, {
			layouts: [layout],
		});
		updateEjsxHmrOwnership([page]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(`${LAYOUTS_DIR}/base-layout.tsx`)).toBe(true);
	});

	it('skips the update when the resulting file set is unchanged', () => {
		const component = makeComponent(`${COMPONENTS_DIR}/copy-for-llm/index.tsx`);
		updateEjsxHmrOwnership([component]);
		const firstHash = getEjsxHmrOwnership().hash;
		const firstSet = getEjsxHmrOwnership().fileOwners;

		updateEjsxHmrOwnership([component]);
		const secondHash = getEjsxHmrOwnership().hash;
		const secondSet = getEjsxHmrOwnership().fileOwners;

		expect(secondHash).toBe(firstHash);
		expect(secondSet).toBe(firstSet);
	});

	it('updates the hash when the file set changes', () => {
		const first = makeComponent(`${COMPONENTS_DIR}/copy-for-llm/index.tsx`);
		updateEjsxHmrOwnership([first]);
		const firstHash = getEjsxHmrOwnership().hash;

		const second = makeComponent(`${COMPONENTS_DIR}/docs-bar/index.tsx`);
		updateEjsxHmrOwnership([first, second]);

		expect(getEjsxHmrOwnership().hash).not.toBe(firstHash);
		expect(getEjsxHmrOwnership().fileOwners.size).toBe(2);
	});

	it('protects against cycles in the dependency graph', () => {
		const fileA = `${COMPONENTS_DIR}/a.tsx`;
		const fileB = `${COMPONENTS_DIR}/b.tsx`;

		const a = makeComponent(fileA);
		const b = makeComponent(fileB, {
			dependencies: { components: [a] },
		});
		(a as { config: EcoComponentConfig }).config = {
			...a.config,
			dependencies: { components: [b] },
		};

		updateEjsxHmrOwnership([a]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(fileA)).toBe(true);
		expect(state.fileOwners.has(fileB)).toBe(true);
	});

	it('ignores components without __eco metadata', () => {
		const a = makeComponent(`${COMPONENTS_DIR}/a.tsx`);
		const b = (() => undefined) as unknown as EcoComponent;
		(b as { config?: EcoComponentConfig }).config = {
			dependencies: { components: [a] },
		};

		updateEjsxHmrOwnership([a, b]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(`${COMPONENTS_DIR}/a.tsx`)).toBe(true);
	});

	it('merges nested render trees before publishing ownership', () => {
		const mdxFile = `${SRC_DIR}/content/docs/intro.mdx`;
		const depFile = `${COMPONENTS_DIR}/demo.tsx`;
		const pageFile = `${PAGES_DIR}/docs/[...slug]/index.tsx`;

		const dep = makeComponent(depFile);
		const mdx = makeComponent(mdxFile, {
			dependencies: { components: [dep] },
		});
		const page = makeComponent(pageFile);

		const pending = new Set<string>();
		mergeEjsxHmrOwnership(pending, [mdx]);
		mergeEjsxHmrOwnership(pending, [page]);
		publishEjsxHmrOwnership(pending);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(pageFile)).toBe(true);
		expect(state.fileOwners.has(mdxFile)).toBe(true);
		expect(state.fileOwners.has(depFile)).toBe(true);
	});

	it('replaces ownership when page publish follows a separate component publish', () => {
		const mdxFile = `${SRC_DIR}/content/docs/intro.mdx`;
		const pageFile = `${PAGES_DIR}/docs/[...slug]/index.tsx`;

		const mdx = makeComponent(mdxFile);
		const page = makeComponent(pageFile);

		updateEjsxHmrOwnership([mdx]);
		updateEjsxHmrOwnership([page]);

		const state = getEjsxHmrOwnership();
		expect(state.fileOwners.has(pageFile)).toBe(true);
		expect(state.fileOwners.has(mdxFile)).toBe(false);
	});
});
