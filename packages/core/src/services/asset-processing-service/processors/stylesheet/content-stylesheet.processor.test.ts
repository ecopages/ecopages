import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { fileSystem } from '@ecopages/file-system';
import { ContentStylesheetProcessor } from './content-stylesheet.processor';
import type { EcoPagesAppConfig } from '../../../../internal-types';
import type { ContentStylesheetAsset } from '../../assets.types';

const originalWrite = fileSystem.write;

const createMockConfig = (): EcoPagesAppConfig =>
	({
		rootDir: '/test/project',
		srcDir: 'src',
		distDir: '.eco/public',
		absolutePaths: {
			distDir: '/test/project/.eco/public',
			srcDir: '/test/project/src',
		},
	}) as unknown as EcoPagesAppConfig;

describe('ContentStylesheetProcessor', () => {
	let writeMock: ReturnType<typeof mock>;

	beforeEach(() => {
		writeMock = mock(() => {});
		fileSystem.write = writeMock;
	});

	afterEach(() => {
		fileSystem.write = originalWrite;
		mock.restore();
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
	});
});
