import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ContentScriptProcessor } from './content-script.processor';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types.ts';
import type { ContentScriptAsset } from '../../assets.types.ts';
import type { BrowserBundleGroupedEntry } from '../../../browser-bundle.service.ts';

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
		additionalWatchPaths: [],
		defaultMetadata: { title: 'Test', description: 'Test' },
		integrations: [],
		integrationsDependencies: [],
		absolutePaths: {
			config: '/test/project/eco.config.ts',
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
	beforeEach(() => {
		vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'write').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'remove').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'readFileSync').mockImplementation(() => '');
	});

	afterEach(() => {
		vi.restoreAllMocks();
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
		expect(fileSystem.remove).toHaveBeenCalledTimes(1);
	});

	test('processGrouped should fall back to per-entry processing when bundling is disabled', async () => {
		const processor = new ContentScriptProcessor({ appConfig: createMockConfig() });
		const processSpy = vi
			.spyOn(processor, 'process')
			.mockResolvedValueOnce({
				kind: 'script',
				inline: false,
				filepath: '/tmp/first.js',
			})
			.mockResolvedValueOnce({
				kind: 'script',
				inline: false,
				filepath: '/tmp/second.js',
			});

		const results = await processor.processGrouped([
			{
				kind: 'script',
				source: 'content',
				content: 'console.log("first")',
				bundle: false,
			},
			{
				kind: 'script',
				source: 'content',
				content: 'console.log("second")',
				bundle: false,
			},
		]);

		expect(processSpy).toHaveBeenCalledTimes(2);
		expect(results).toHaveLength(2);
	});

	test('processGrouped should remove temporary entries when bundling fails', async () => {
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
});
