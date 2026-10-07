import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ContentScriptProcessor } from './content-script.processor';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import type { ContentScriptAsset } from '../../assets.types.ts';
import type { BrowserBundleGroupedEntry } from '../../../browser-bundle.service.ts';
import { BrowserBundleService } from '../../../browser-bundle.service.ts';

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
		sourceTransforms: new Map(),
	};
}

class TestContentScriptProcessor extends ContentScriptProcessor {
	readonly bundleScriptsCalls: Array<{
		entries: BrowserBundleGroupedEntry[];
		outdir: string;
		naming?: string;
	}> = [];
	bundleScriptsResult = new Map<string, string>();
	bundleScriptsError?: Error;

	protected override async bundleScripts({
		entries,
		outdir,
		naming,
	}: {
		entries: BrowserBundleGroupedEntry[];
		outdir: string;
		naming?: string;
	}): Promise<Map<string, string>> {
		this.bundleScriptsCalls.push({ entries, outdir, naming });

		if (this.bundleScriptsError) {
			throw this.bundleScriptsError;
		}

		return this.bundleScriptsResult;
	}
}

describe('ContentScriptProcessor', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		process.env.NODE_ENV = 'development';
		vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'write').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'remove').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'readFileSync').mockImplementation(() => '');
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
		vi.restoreAllMocks();
	});

	test.each([false, true])('maps blog and blog-post to their own outputs with reversed order %s', async (reverse) => {
		const outputs = ['/test/project/assets/pages__blog-post-hash.js', '/test/project/assets/pages__blog-hash.js'];
		vi.spyOn(BrowserBundleService.prototype, 'bundleGroupedEntries').mockImplementation(async (entries) => ({
			success: true,
			logs: [],
			outputs: (reverse ? [...outputs].reverse() : outputs).map((path) => ({ path })),
			entryOutputs: Object.fromEntries(
				entries.map((entry) => [entry.entrypoint, entry.entryName === 'pages__blog' ? outputs[1] : outputs[0]]),
			),
		}));
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

	test('rejects a grouped build without an entry output record instead of guessing from its filename', async () => {
		vi.spyOn(BrowserBundleService.prototype, 'bundleGroupedEntries').mockResolvedValue({
			success: true,
			logs: [],
			outputs: [{ path: '/test/project/assets/pages__blog-hash.js' }],
		});
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
		processor.bundleScriptsResult = new Map([
			['page-entry', '/test/project/.eco/public/assets/page-entry-abc123.js'],
			['lazy-entry', '/test/project/.eco/public/assets/lazy-entry-def456.js'],
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
				groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
			}),
			expect.objectContaining({
				filepath: '/test/project/.eco/public/assets/lazy-entry-def456.js',
				excludeFromHtml: true,
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
		process.env.NODE_ENV = 'production';
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
			['page-entry', '/test/project/.eco/public/assets/page-entry-abc123.js'],
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
});
