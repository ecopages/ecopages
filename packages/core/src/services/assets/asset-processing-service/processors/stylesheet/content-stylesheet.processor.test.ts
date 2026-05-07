import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ContentStylesheetProcessor } from './content-stylesheet.processor';
import type { EcoPagesAppConfig } from '../../../../../types/internal-types';
import type { ContentStylesheetAsset } from '../../assets.types';
import { Processor } from '../../../../../plugins/processor.ts';

function createMockConfig(processors = new Map<string, Processor>()): EcoPagesAppConfig {
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
		processors,
		loaders: new Map(),
		sourceTransforms: new Map(),
	};
}

class TestStylesheetProcessor extends Processor {
	readonly buildPlugins = undefined;
	readonly plugins = undefined;

	constructor() {
		super({
			name: 'bundled-css',
			capabilities: [{ kind: 'stylesheet' }],
		});
	}

	async setup(): Promise<void> {}

	async teardown(): Promise<void> {}

	async process(input: unknown): Promise<unknown> {
		return typeof input === 'string' ? input.replace('red', 'green') : input;
	}
}

describe('ContentStylesheetProcessor', () => {
	let writeMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		writeMock = vi.spyOn(fileSystem, 'write').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'exists').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('process - file-based stylesheet', () => {
		test('should write stylesheet file when not inline', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: red; }',
				inline: false,
			};

			const result = await processor.process(dep);

			expect(writeMock).toHaveBeenCalled();
			expect(result.filepath).toBeDefined();
			expect(result.filepath).toContain('style-');
			expect(result.filepath).toContain('.css');
			expect(result.kind).toBe('stylesheet');
			expect(result.inline).toBe(false);
			expect(result.content).toBeUndefined();
		});

		test('should include hash in filename', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: blue; }',
				inline: false,
			};

			const result = await processor.process(dep);

			expect(result.filepath).toMatch(/style-\d+\.css$/);
		});
	});

	describe('process - inline stylesheet', () => {
		test('should return content without writing file when inline', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.inline { display: flex; }',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(writeMock).not.toHaveBeenCalled();
			expect(result.inline).toBe(true);
			expect(result.content).toBe('.inline { display: flex; }');
			expect(result.filepath).toBeUndefined();
		});
	});

	describe('process - caching', () => {
		test('should return cached result on subsequent calls', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.cached { margin: 0; }',
				inline: false,
			};

			const result1 = await processor.process(dep);
			const result2 = await processor.process(dep);

			expect(writeMock.mock.calls.length).toBe(1);
			expect(result1).toEqual(result2);
		});

		test('should use different cache keys for different content', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep1: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.first { padding: 10px; }',
				inline: false,
			};

			const dep2: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.second { padding: 20px; }',
				inline: false,
			};

			await processor.process(dep1);
			await processor.process(dep2);

			expect(writeMock.mock.calls.length).toBe(2);
		});
	});

	describe('process - attributes and position', () => {
		test('should preserve attributes from dependency', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.styled { color: green; }',
				inline: true,
				attributes: { 'data-theme': 'dark' },
			};

			const result = await processor.process(dep);

			expect(result.attributes).toEqual({ 'data-theme': 'dark' });
		});

		test('should preserve position from dependency', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.head-style { font-size: 16px; }',
				inline: true,
				position: 'head',
			};

			const result = await processor.process(dep);

			expect(result.position).toBe('head');
		});

		test('should return updated attributes when cached asset is retrieved with different attributes', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });

			const depWithMedia: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.cached-style { color: red; }',
				inline: false,
				attributes: { media: 'screen' },
				position: 'head',
			};

			const depWithPrint: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: '.cached-style { color: red; }',
				inline: false,
				attributes: { media: 'print' },
				position: 'body',
			};

			const result1 = await processor.process(depWithMedia);
			const result2 = await processor.process(depWithPrint);

			expect(result1.attributes).toEqual({ media: 'screen' });
			expect(result1.position).toBe('head');
			expect(result2.attributes).toEqual({ media: 'print' });
			expect(result2.position).toBe('body');
		});
	});

	describe('process - stylesheet processors', () => {
		test('should apply configured stylesheet processors to bundled content', async () => {
			const processors = new Map<string, Processor>([['bundled-css', new TestStylesheetProcessor()]]);
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(processors),
			});

			const dep: ContentStylesheetAsset = {
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: red; }',
				inline: true,
			};

			const result = await processor.process(dep);

			expect(result.content).toBe('body { color: green; }');
		});
	});
});
