import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProjectWatcher } from './project-watcher';
import type { EcoPagesAppConfig } from '../internal-types';
import { ConfigBuilder } from '../config/config-builder';
import { createMockHmrManager, createMockBridge } from './project-watcher.test-helpers';

const TEST_ROOT = path.join(import.meta.dir, '__test-temp__');

const createTestDir = (subpath: string): string => {
	const fullPath = path.join(TEST_ROOT, subpath);
	mkdirSync(fullPath, { recursive: true });
	return fullPath;
};

const writeTestFile = (filePath: string, content: string): void => {
	const dir = path.dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(filePath, content, 'utf-8');
};

const createIntegrationConfig = async (testId: string): Promise<EcoPagesAppConfig> => {
	const rootDir = path.join(TEST_ROOT, testId);
	return await new ConfigBuilder().setRootDir(rootDir).build();
};

describe('ProjectWatcher - Integration Tests', () => {
	beforeEach(() => {
		if (existsSync(TEST_ROOT)) {
			rmSync(TEST_ROOT, { recursive: true, force: true });
		}
		mkdirSync(TEST_ROOT, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_ROOT)) {
			rmSync(TEST_ROOT, { recursive: true, force: true });
		}
		mock.restore();
	});

	describe('Public Directory File Operations', () => {
		test('should copy file when added to public directory', async () => {
			const testId = 'public-file-add';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'favicon.ico');
			const destFile = path.join(config.absolutePaths.distDir, 'favicon.ico');

			writeTestFile(sourceFile, 'fake-icon-data');
			await (watcher as any).handlePublicDirFileChange(sourceFile);

			expect(existsSync(destFile)).toBe(true);
			const content = readFileSync(destFile, 'utf-8');
			expect(content).toBe('fake-icon-data');
		});

		test('should copy file to subdirectory in dist', async () => {
			const testId = 'public-subdir-add';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public', 'images'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'images', 'logo.png');
			const destFile = path.join(config.absolutePaths.distDir, 'images', 'logo.png');

			writeTestFile(sourceFile, 'fake-png-data');

			await (watcher as any).handlePublicDirFileChange(sourceFile);

			expect(existsSync(destFile)).toBe(true);
			const content = readFileSync(destFile, 'utf-8');
			expect(content).toBe('fake-png-data');
		});

		test('should update file when changed in public directory', async () => {
			const testId = 'public-file-update';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'robots.txt');
			const destFile = path.join(config.absolutePaths.distDir, 'robots.txt');

			writeTestFile(sourceFile, 'User-agent: *\nDisallow: /');
			await (watcher as any).handlePublicDirFileChange(sourceFile);

			expect(existsSync(destFile)).toBe(true);
			let content = readFileSync(destFile, 'utf-8');
			expect(content).toBe('User-agent: *\nDisallow: /');

			writeTestFile(sourceFile, 'User-agent: *\nAllow: /');
			await (watcher as any).handlePublicDirFileChange(sourceFile);

			content = readFileSync(destFile, 'utf-8');
			expect(content).toBe('User-agent: *\nAllow: /');
		});

		test('should handle deeply nested directory structure', async () => {
			const testId = 'public-deep-nesting';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public', 'assets', 'fonts', 'woff2'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'assets', 'fonts', 'woff2', 'font.woff2');
			const destFile = path.join(config.absolutePaths.distDir, 'assets', 'fonts', 'woff2', 'font.woff2');

			writeTestFile(sourceFile, 'fake-font-binary-data');

			await (watcher as any).handlePublicDirFileChange(sourceFile);

			expect(existsSync(destFile)).toBe(true);
			const content = readFileSync(destFile, 'utf-8');
			expect(content).toBe('fake-font-binary-data');
		});

		test('should trigger reload after successful copy', async () => {
			const testId = 'public-reload-trigger';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'manifest.json');
			writeTestFile(sourceFile, '{"name":"test"}');

			await (watcher as any).handlePublicDirFileChange(sourceFile);

			expect(bridge.reload).toHaveBeenCalled();
		});

		test('should handle file copy errors gracefully', async () => {
			const testId = 'public-copy-error';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const nonExistentFile = path.join(config.absolutePaths.publicDir, 'does-not-exist.txt');

			await (watcher as any).handlePublicDirFileChange(nonExistentFile);

			expect(bridge.reload).toHaveBeenCalled();
		});
	});

	describe('File Change Detection Integration', () => {
		test('should handle public file through handleFileChange', async () => {
			const testId = 'handle-public-change';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.publicDir, 'sitemap.xml');
			const destFile = path.join(config.absolutePaths.distDir, 'sitemap.xml');

			writeTestFile(sourceFile, '<urlset></urlset>');

			await (watcher as any).handleFileChange(sourceFile);

			expect(existsSync(destFile)).toBe(true);
			expect(bridge.reload).toHaveBeenCalled();
			expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should not copy non-public files', async () => {
			const testId = 'non-public-no-copy';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'components'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const sourceFile = path.join(config.absolutePaths.srcDir, 'components', 'Button.tsx');
			const wouldBeDestFile = path.join(config.absolutePaths.distDir, 'components', 'Button.tsx');

			writeTestFile(sourceFile, 'export const Button = () => {}');

			await (watcher as any).handleFileChange(sourceFile);

			expect(existsSync(wouldBeDestFile)).toBe(false);
			expect(hmrManager.handleFileChange).toHaveBeenCalled();
		});
	});

	describe('Multiple File Operations', () => {
		test('should handle multiple files added sequentially', async () => {
			const testId = 'multiple-sequential';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const files = ['file1.txt', 'file2.txt', 'file3.txt'];

			for (const filename of files) {
				const sourceFile = path.join(config.absolutePaths.publicDir, filename);
				const destFile = path.join(config.absolutePaths.distDir, filename);

				writeTestFile(sourceFile, `content-of-${filename}`);
				await (watcher as any).handlePublicDirFileChange(sourceFile);

				expect(existsSync(destFile)).toBe(true);
				const content = readFileSync(destFile, 'utf-8');
				expect(content).toBe(`content-of-${filename}`);
			}

			expect(bridge.reload).toHaveBeenCalledTimes(3);
		});

		test('should handle mixed file types in public directory', async () => {
			const testId = 'mixed-file-types';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: mock(() => {}),
				hmrManager,
				bridge,
			});

			const files = {
				'robots.txt': 'User-agent: *',
				'manifest.json': '{"name":"app"}',
				'favicon.ico': 'binary-data',
				'sitemap.xml': '<urlset></urlset>',
			};

			for (const [filename, content] of Object.entries(files)) {
				const sourceFile = path.join(config.absolutePaths.publicDir, filename);
				const destFile = path.join(config.absolutePaths.distDir, filename);

				writeTestFile(sourceFile, content);
				await (watcher as any).handlePublicDirFileChange(sourceFile);

				expect(existsSync(destFile)).toBe(true);
				expect(readFileSync(destFile, 'utf-8')).toBe(content);
			}
		});
	});
});
