import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import { ContentStylesheetProcessor } from './content-stylesheet.processor';
import type { EcoPagesAppConfig } from '../../../../config/internal-types';
import type { ContentStylesheetAsset } from '../../assets.types';
import { Processor, type ProcessorConfig } from '../../../../plugins/processor.ts';

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
		processors,
		loaders: new Map(),
	};
}

class TestStylesheetProcessor extends Processor {
	constructor(config: Pick<ProcessorConfig, 'name' | 'capabilities'> = { name: 'bundled-css' }) {
		super({ capabilities: [{ kind: 'stylesheet' }], ...config });
	}

	override async setup(): Promise<void> {}

	override async transformStylesheet(css: string, _file?: string): Promise<string> {
		return css.replace('red', 'green');
	}
}

describe('ContentStylesheetProcessor', () => {
	let writeMock: ReturnType<typeof vi.spyOn>;
	const written = new Set<string>();
	const stylesheetWrites: string[] = [];

	beforeEach(() => {
		written.clear();
		stylesheetWrites.length = 0;
		writeMock = vi.spyOn(fileSystem, 'write').mockImplementation((filepath: string) => {
			written.add(filepath);
			if (filepath.endsWith('.css')) stylesheetWrites.push(filepath);
		});
		vi.spyOn(fileSystem, 'ensureDir').mockImplementation(() => {});
		vi.spyOn(fileSystem, 'exists').mockImplementation((filepath: string) => written.has(filepath));
		vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
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
			expect(result.filepath).toMatch(/[a-f0-9]{16}\.css$/);
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

			expect(result.filepath).toMatch(/[a-f0-9]{16}\.css$/);
		});

		test('keeps source metadata distinct when identical CSS bundles have different inputs', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });
			const createBundle = (bundledSourceFilepaths: string[]): ContentStylesheetAsset => ({
				kind: 'stylesheet',
				source: 'content',
				content: '.example { color: red; }',
				inline: false,
				packageRole: 'page-style',
				bundledSourceFilepaths,
			});

			const first = await processor.process(createBundle(['/app/a.css', '/app/b.css']));
			const second = await processor.process(createBundle(['/app/d.css', '/app/e.css']));

			expect(second.bundledSourceFilepaths).toEqual(['/app/d.css', '/app/e.css']);
			expect(first.bundledSourceFilepaths).toEqual(['/app/a.css', '/app/b.css']);
		});

		test('keeps the URL when the processed bytes are unchanged and changes it when they are not', async () => {
			const processor = new ContentStylesheetProcessor({ appConfig: createMockConfig() });
			const first = await processor.process({
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: navy; }',
				inline: false,
			});
			const same = await new ContentStylesheetProcessor({ appConfig: createMockConfig() }).process({
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: navy; }',
				inline: false,
			});
			const edited = await new ContentStylesheetProcessor({ appConfig: createMockConfig() }).process({
				kind: 'stylesheet',
				source: 'content',
				content: 'body { color: teal; }',
				inline: false,
			});

			expect(same.filepath).toBe(first.filepath);
			expect(edited.filepath).not.toBe(first.filepath);
		});
	});

	describe('process - processingOrigin', () => {
		test('passes processingOrigin to stylesheet transforms as the file path', async () => {
			const filePaths: Array<string | undefined> = [];
			const recorder = new (class extends TestStylesheetProcessor {
				override async transformStylesheet(css: string, file: string): Promise<string> {
					filePaths.push(file);
					return css;
				}
			})();
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(new Map([[recorder.name, recorder]])),
			});
			const dep = (processingOrigin?: string): ContentStylesheetAsset => ({
				kind: 'stylesheet',
				source: 'content',
				content: '@import "./tokens.css";',
				inline: true,
				...(processingOrigin ? { processingOrigin } : {}),
			});

			await processor.process(dep('/test/project/src/pages/about.html.css'));

			expect(filePaths).toEqual(['/test/project/src/pages/about.html.css']);
		});
	});

	describe('process - stylesheet processors', () => {
		const inlineDep: ContentStylesheetAsset = {
			kind: 'stylesheet',
			source: 'content',
			content: 'a { color: red; }',
			inline: true,
			processingOrigin: '/test/project/src/pages/about.html.css',
		};

		class AppendingProcessor extends TestStylesheetProcessor {
			constructor(
				config: Pick<ProcessorConfig, 'name' | 'capabilities'>,
				private readonly suffix: string,
			) {
				super(config);
			}

			override async transformStylesheet(css: string): Promise<string> {
				return `${css}${this.suffix}`;
			}
		}

		class HooklessProcessor extends Processor {
			constructor() {
				super({ name: 'postcss-lookalike', capabilities: [{ kind: 'stylesheet' }] });
			}
			override async setup(): Promise<void> {}
		}

		test('chains transformStylesheet in registration order', async () => {
			const first = new AppendingProcessor({ name: 'first' }, '/*1*/');
			const second = new AppendingProcessor({ name: 'second' }, '/*2*/');
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(
					new Map<string, Processor>([
						[first.name, first],
						[second.name, second],
					]),
				),
			});

			const result = await processor.process(inlineDep);

			expect(result.content).toBe('a { color: red; }/*1*//*2*/');
		});

		test('skips a Processor that has no transformStylesheet', async () => {
			const hookless = new HooklessProcessor();
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(new Map<string, Processor>([[hookless.name, hookless]])),
			});

			const result = await processor.process(inlineDep);

			expect(result.content).toBe('a { color: red; }');
		});

		test('does not run a Processor without capabilities because its name contains postcss', async () => {
			const capabilityless = new AppendingProcessor({ name: 'my-postcss-fork', capabilities: [] }, '/*x*/');
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(new Map<string, Processor>([[capabilityless.name, capabilityless]])),
			});

			const result = await processor.process(inlineDep);

			expect(result.content).toBe('a { color: red; }');
		});

		test('skips a Processor that does not declare a stylesheet capability', async () => {
			const imagesOnly = new AppendingProcessor(
				{ name: 'images-only', capabilities: [{ kind: 'image' }] },
				'/*x*/',
			);
			const processor = new ContentStylesheetProcessor({
				appConfig: createMockConfig(new Map<string, Processor>([[imagesOnly.name, imagesOnly]])),
			});

			const result = await processor.process(inlineDep);

			expect(result.content).toBe('a { color: red; }');
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

			expect(stylesheetWrites).toHaveLength(1);
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

			expect(stylesheetWrites).toHaveLength(2);
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
