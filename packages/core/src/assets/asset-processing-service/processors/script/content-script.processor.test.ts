import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { fileSystem } from '@ecopages/file-system';
import { ContentScriptProcessor } from './content-script.processor';
import type { EcoPagesAppConfig, IHmrManager } from '../../../../config/internal-types.ts';
import type { ContentScriptAsset } from '../../assets.types.ts';
import type { BrowserBundleGroupedEntry } from '../../../browser-bundle.service.ts';
import { BrowserBundleService } from '../../../browser-bundle.service.ts';
import type { BundledScriptOutput } from '../base/base-script-processor.ts';
import { createBuildSuccess } from '../../../../__fixtures__/build/build-result.ts';

function createMockConfig(): EcoPagesAppConfig {
	return {
		baseUrl: 'http://localhost:3000',
		rootDir: '/test/project',
		srcDir: 'src',
		publicDir: 'public',
		pagesDir: 'pages',
		includesDir: 'includes',
		layoutsDir: 'layouts',
		distDir: '.eco/public',
		workDir: '.eco',
		templatesExt: [],
		componentsDir: 'components',
		robotsTxt: { preferences: { '*': [] } },
		sitemap: { enabled: false, fileName: 'sitemap.xml', extraUrls: [], exclude: [] },
		additionalWatchPaths: [],
		defaultMetadata: { title: 'Test', description: 'Test' },
		integrations: [],
		absolutePaths: {
			config: '/test/project/eco.config.ts',
			configModuleFiles: ['/test/project/eco.config.ts'],
			componentsDir: '/test/project/src/components',
			distDir: '/test/project/.eco/public',
			workDir: '/test/project/.eco',
			includesDir: '/test/project/src/includes',
			layoutsDir: '/test/project/src/layouts',
			pagesDir: '/test/project/src/pages',
			projectDir: '/test/project',
			publicDir: '/test/project/public',
			srcDir: '/test/project/src',
			htmlTemplatePath: '/test/project/src/html.tsx',
			error404TemplatePath: '/test/project/src/404.tsx',
			error500TemplatePath: '/test/project/src/500.tsx',
		},
		processors: new Map(),
		loaders: new Map(),
	};
}

class TestContentScriptProcessor extends ContentScriptProcessor {
	readonly bundleScriptsCalls: Array<{
		entries: BrowserBundleGroupedEntry[];
		outdir: string;
		naming?: string;
	}> = [];
	bundleScriptsResult = new Map<string, BundledScriptOutput>();
	bundleScriptsError?: Error;

	protected override async bundleScripts({
		entries,
		outdir,
		naming,
	}: {
		entries: BrowserBundleGroupedEntry[];
		outdir: string;
		naming?: string;
	}): Promise<Map<string, BundledScriptOutput>> {
		this.bundleScriptsCalls.push({ entries, outdir, naming });

		if (this.bundleScriptsError) {
			throw this.bundleScriptsError;
		}

		return this.bundleScriptsResult;
	}
}

describe('ContentScriptProcessor', () => {
	beforeEach(() => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'write').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'remove').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'readFileSync').mockImplementation(() => '');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('an unbundled script file under HMR', () => {
		const script = (attributes?: Record<string, string>): ContentScriptAsset => ({
			kind: 'script',
			source: 'content',
			name: 'bootstrap',
			content: 'import { createElement } from "react";',
			bundle: false,
			attributes,
		});
		const writtenSource = () => vi.mocked(fileSystem.write).mock.calls.at(-1)?.[1];

		test('a module script is written with its imports rewritten', async () => {
			const rewriteModuleImports = vi.fn(async () => 'import React from "/assets/vendors/react.js";');
			const processor = new ContentScriptProcessor({
				appConfig: createMockConfig(),
				getHmrManager: () => ({ isEnabled: () => true, rewriteModuleImports }) as unknown as IHmrManager,
			});

			await processor.process(script({ type: 'module' }));

			expect(rewriteModuleImports).toHaveBeenCalledWith(
				'import { createElement } from "react";',
				path.join('/test/project/.eco/public/assets/scripts', 'bootstrap.js'),
			);
			expect(writtenSource()).toBe('import React from "/assets/vendors/react.js";');
		});

		test('an inline module script embeds the rewritten source', async () => {
			const rewriteModuleImports = vi.fn(async () => 'import React from "/assets/vendors/react.js";');
			const processor = new ContentScriptProcessor({
				appConfig: createMockConfig(),
				getHmrManager: () => ({ isEnabled: () => true, rewriteModuleImports }) as unknown as IHmrManager,
			});

			const processed = await processor.process({ ...script({ type: 'module' }), inline: true });

			expect(processed.content).toBe('import React from "/assets/vendors/react.js";');
			expect(fileSystem.write).not.toHaveBeenCalled();
		});

		test.each([
			{ label: 'a classic script', attributes: undefined, hmrEnabled: true },
			{ label: 'a module script with HMR off', attributes: { type: 'module' }, hmrEnabled: false },
		])('$label keeps its source', async ({ attributes, hmrEnabled }) => {
			const rewriteModuleImports = vi.fn();
			const processor = new ContentScriptProcessor({
				appConfig: createMockConfig(),
				getHmrManager: () => ({ isEnabled: () => hmrEnabled, rewriteModuleImports }) as unknown as IHmrManager,
			});

			await processor.process(script(attributes));

			expect(rewriteModuleImports).not.toHaveBeenCalled();
			expect(writtenSource()).toBe('import { createElement } from "react";');
		});
	});

	test.each([false, true])('maps blog and blog-post to their own outputs with reversed order %s', async (reverse) => {
		const outputs = ['/test/project/assets/pages__blog-post-hash.js', '/test/project/assets/pages__blog-hash.js'];
		vi.spyOn(BrowserBundleService.prototype, 'bundleGroupedEntries').mockImplementation(async (entries) =>
			createBuildSuccess({
				outputs: (reverse ? [...outputs].reverse() : outputs).map((path) => ({ path })),
				entryOutputs: Object.fromEntries(
					entries.map((entry) => [
						entry.entrypoint,
						entry.entryName === 'pages__blog' ? outputs[1] : outputs[0],
					]),
				),
			}),
		);
		const processor = new ContentScriptProcessor({ appConfig: createMockConfig() });
		const result = await processor.processGrouped(
			['blog', 'blog-post'].map((name) => ({
				kind: 'script',
				source: 'content',
				content: `console.log('${name}');`,
				groupedBundle: { id: 'pages', entryName: `pages__${name}` },
			})),
		);
		expect(result.map((asset) => asset.filepath)).toEqual([outputs[1], outputs[0]]);
	});

	test('bundles an inline script outside dist and returns its code without an output file', async () => {
		const config = createMockConfig();
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle').mockImplementation(async (options) => {
			const output = path.join(options.outdir as string, 'bootstrap-hash.js');
			const [entrypoint] = options.entrypoints as string[];
			return createBuildSuccess({
				outputs: [{ path: output }],
				entryOutputs: { [entrypoint as string]: output },
			});
		});
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		vi.spyOn(fileSystem, 'readFileSync').mockReturnValue('console.log("bundled");');
		const processor = new ContentScriptProcessor({ appConfig: config });

		const processed = await processor.process({
			kind: 'script',
			source: 'content',
			name: 'bootstrap',
			content: 'import "./bootstrap-impl.js";',
			inline: true,
			attributes: { type: 'module' },
		});

		const options = bundle.mock.calls[0]?.[0];
		expect(options?.splitting).toBe(false);
		expect(path.relative(config.absolutePaths.workDir, options?.outdir as string).startsWith('..')).toBe(false);
		expect(path.relative(config.absolutePaths.distDir, options?.outdir as string).startsWith('..')).toBe(true);
		expect(processed.filepath).toBeUndefined();
		expect(processed.content).toBe('console.log("bundled");');
		expect(fileSystem.remove).toHaveBeenCalledWith(path.dirname(options?.outdir as string));
	});

	test('rejects a grouped build without an entry output record instead of guessing from its filename', async () => {
		vi.spyOn(BrowserBundleService.prototype, 'bundleGroupedEntries').mockResolvedValue(
			createBuildSuccess({ outputs: [{ path: '/test/project/assets/pages__blog-hash.js' }] }),
		);
		const processor = new ContentScriptProcessor({ appConfig: createMockConfig() });
		await expect(
			processor.processGrouped([
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("blog");',
					groupedBundle: { id: 'pages', entryName: 'pages__blog' },
				},
			]),
		).rejects.toThrow('No build output generated for grouped entry pages__blog');
	});

	test('processGrouped should bundle grouped entries together and preserve logical entry mapping', async () => {
		const processor = new TestContentScriptProcessor({ appConfig: createMockConfig() });
		const pageHelper = '/test/project/src/page-helper.ts';
		const lazyHelper = '/test/project/src/lazy-helper.ts';
		processor.bundleScriptsResult = new Map([
			[
				'page-entry',
				{
					filepath: '/test/project/.eco/public/assets/page-entry-abc123.js',
					inputPaths: [pageHelper],
				},
			],
			[
				'lazy-entry',
				{
					filepath: '/test/project/.eco/public/assets/lazy-entry-def456.js',
					inputPaths: [lazyHelper],
				},
			],
		]);

		const deps: ContentScriptAsset[] = [
			{
				kind: 'script',
				source: 'content',
				content: 'import "/test/project/src/page.ts";',
				position: 'head',
				attributes: { type: 'module', defer: '' },
				packageRole: 'page-script',
				groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
			},
			{
				kind: 'script',
				source: 'content',
				content: 'import "/test/project/src/lazy.ts";',
				position: 'head',
				attributes: { type: 'module', defer: '', 'data-eco-lazy-key': 'lazy-key' },
				excludeFromHtml: true,
				groupedBundle: { id: 'bundle-1', entryName: 'lazy-entry' },
			},
		];

		const results = await processor.processGrouped(deps);

		expect(processor.bundleScriptsCalls).toHaveLength(1);
		expect(processor.bundleScriptsCalls[0]).toEqual(
			expect.objectContaining({
				entries: expect.arrayContaining([
					expect.objectContaining({ entryName: 'page-entry' }),
					expect.objectContaining({ entryName: 'lazy-entry' }),
				]),
				naming: '[name]-[hash].[ext]',
			}),
		);

		expect(results).toEqual([
			expect.objectContaining({
				filepath: '/test/project/.eco/public/assets/page-entry-abc123.js',
				packageRole: 'page-script',
				bundledSourceFilepaths: [pageHelper],
				groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
			}),
			expect.objectContaining({
				filepath: '/test/project/.eco/public/assets/lazy-entry-def456.js',
				excludeFromHtml: true,
				bundledSourceFilepaths: [lazyHelper],
				groupedBundle: { id: 'bundle-1', entryName: 'lazy-entry' },
			}),
		]);

		expect(fileSystem.write).toHaveBeenCalledTimes(2);
		expect(fileSystem.remove).toHaveBeenCalledTimes(2);
	});

	test('processGrouped should fall back to per-entry processing when bundling is disabled', async () => {
		const processor = new ContentScriptProcessor({ appConfig: createMockConfig() });
		vi.spyOn(fileSystem, 'write').mockImplementation(() => {});

		const results = await processor.processGrouped([
			{
				kind: 'script',
				source: 'content',
				content: 'console.log("first")',
				bundle: false,
				groupedBundle: { id: 'bundle-1', entryName: 'first-entry' },
			},
			{
				kind: 'script',
				source: 'content',
				content: 'console.log("second")',
				bundle: false,
				groupedBundle: { id: 'bundle-1', entryName: 'second-entry' },
			},
		]);

		expect(results).toEqual([
			expect.objectContaining({ groupedBundle: { id: 'bundle-1', entryName: 'first-entry' } }),
			expect.objectContaining({ groupedBundle: { id: 'bundle-1', entryName: 'second-entry' } }),
		]);
	});

	test('processGrouped should remove temporary entries when bundling fails', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const processor = new TestContentScriptProcessor({ appConfig: createMockConfig() });
		processor.bundleScriptsError = new Error('bundle failed');

		await expect(
			processor.processGrouped([
				{
					kind: 'script',
					source: 'content',
					content: 'console.log("grouped")',
					groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
				},
			]),
		).rejects.toThrow('bundle failed');

		expect(fileSystem.remove).toHaveBeenCalledTimes(1);
	});

	test('processGrouped writes a unique temp entry per call so concurrent same-content builds cannot collide', async () => {
		const processor = new TestContentScriptProcessor({ appConfig: createMockConfig() });
		processor.bundleScriptsResult = new Map([
			['page-entry', { filepath: '/test/project/.eco/public/assets/page-entry-abc123.js', inputPaths: [] }],
		]);
		const written = new Set<string>();
		vi.spyOn(fileSystem, 'write').mockImplementation((filepath) => {
			written.add(filepath);
		});

		const dep: ContentScriptAsset = {
			kind: 'script',
			source: 'content',
			content: 'import "/test/project/src/island.ts";',
			groupedBundle: { id: 'ecopages-app-browser-client', entryName: 'page-entry' },
		};

		await Promise.all([processor.processGrouped([dep]), processor.processGrouped([dep])]);

		expect(written.size).toBe(2);
	});

	test('concurrent grouped builds keep each output entry closure when output paths match', async () => {
		const firstInput = '/test/project/src/first.ts';
		const secondInput = '/test/project/src/second.ts';
		const outputPath = '/test/project/.eco/public/assets/page-entry-abc123.js';
		let releaseBuilds: (() => void) | undefined;
		const bothBuildsStarted = new Promise<void>((resolve) => {
			releaseBuilds = resolve;
		});
		let buildCount = 0;
		vi.spyOn(BrowserBundleService.prototype, 'bundleGroupedEntries').mockImplementation(async (entries) => {
			const buildInput = buildCount === 0 ? firstInput : secondInput;
			buildCount += 1;
			if (buildCount === 2) releaseBuilds?.();
			await bothBuildsStarted;
			return createBuildSuccess({
				outputs: [{ path: outputPath }],
				entryOutputs: Object.fromEntries(entries.map((entry) => [entry.entrypoint, outputPath])),
				dependencyGraph: {
					entrypoints: Object.fromEntries(
						entries.map((entry) => [path.resolve(entry.entrypoint), [entry.entrypoint, buildInput]]),
					),
				},
			});
		});
		const processor = new ContentScriptProcessor({ appConfig: createMockConfig() });
		const dependency: ContentScriptAsset = {
			kind: 'script',
			source: 'content',
			content: 'import "/test/project/src/first.ts";',
			groupedBundle: { id: 'ecopages-app-browser-client', entryName: 'page-entry' },
		};

		const [first, second] = await Promise.all([
			processor.processGrouped([dependency]),
			processor.processGrouped([dependency]),
		]);

		expect(first[0]?.filepath).toBe(outputPath);
		expect(second[0]?.filepath).toBe(outputPath);
		expect(first[0]?.bundledSourceFilepaths).toEqual([firstInput]);
		expect(second[0]?.bundledSourceFilepaths).toEqual([secondInput]);
	});
});
