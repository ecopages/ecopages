import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import chokidar from 'chokidar';
import { ProjectWatcher } from './project-watcher';
import type { EcoPagesAppConfig } from '../types/internal-types';
import type { ProcessorWatchConfig } from '../plugins/processor.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { createMockHmrManager, createMockBridge } from './project-watcher.test-helpers';

const TEST_ROOT = path.join(os.tmpdir(), 'ecopages-integration-test-temp');

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
	return await finalizeEcoPagesConfig({ rootDir });
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
		vi.restoreAllMocks();
	});

	describe('Recursive source subscription', () => {
		test('watches files added under nested srcDir directories', async () => {
			const testId = 'nested-source-files';
			const config = await createIntegrationConfig(testId);
			const sourceDirectory = path.join(config.absolutePaths.srcDir, 'lib');
			mkdirSync(sourceDirectory, { recursive: true });
			const watchEvents: Array<{ kind: 'created' | 'changed'; path: string }> = [];
			const watchConfig: ProcessorWatchConfig = {
				paths: [],
				extensions: ['.ts'],
				onChanges: async ({ created, changed }) => {
					for (const changedPath of created) {
						watchEvents.push({ kind: 'created', path: changedPath });
					}
					for (const changedPath of changed) {
						watchEvents.push({ kind: 'changed', path: changedPath });
					}
				},
			};
			config.processors.set('startup-watch-test', { getWatchConfig: () => watchConfig } as never);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 0,
			});

			try {
				const fileWatcher = await watcher.createWatcherSubscription();
				await vi.waitFor(() => expect(fileWatcher.getWatched()).toHaveProperty(sourceDirectory));
				expect(watchEvents).toEqual([]);
				const newFile = path.join(sourceDirectory, 'new-post.ts');
				writeTestFile(newFile, 'export const newPost = {};\n');
				await vi.waitFor(
					() => expect(watchEvents).toContainEqual({ kind: 'created', path: path.resolve(newFile) }),
					{ timeout: 3000 },
				);
				expect(watchEvents).toEqual([{ kind: 'created', path: path.resolve(newFile) }]);
			} finally {
				await watcher.close();
			}

			expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(bridge.reload).toHaveBeenCalledOnce();
		});
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
			});

			const nonExistentFile = path.join(config.absolutePaths.publicDir, 'does-not-exist.txt');

			await (watcher as any).handlePublicDirFileChange(nonExistentFile);

			expect(bridge.reload).toHaveBeenCalled();
		});
	});

	describe('File Change Detection Integration', () => {
		test('notifies a processor once with created and changed paths in the debounce window', async () => {
			const testId = 'processor-watch-batch';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			const onChanges = vi.fn(async () => {});
			config.processors.set('batch-test', {
				getWatchConfig: () => ({
					paths: [],
					extensions: ['.css', '.tsx'],
					onChanges,
				}),
			} as never);
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => {
				setTimeout(() => watcherEvents.emit('ready'), 0);
				return watcherEvents as never;
			});
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 40,
			});

			const createdPath = path.join(config.absolutePaths.srcDir, 'created.css');
			const changedPath = path.join(config.absolutePaths.srcDir, 'changed.tsx');
			const deletedPath = path.join(config.absolutePaths.srcDir, 'deleted.css');
			const ignoredPath = path.join(config.absolutePaths.srcDir, 'ignored.mdx');
			writeTestFile(changedPath, 'export const Changed = () => 0;');
			writeTestFile(deletedPath, '.deleted { color: red; }');
			writeTestFile(ignoredPath, '# Before');

			try {
				await watcher.createWatcherSubscription();
				writeTestFile(createdPath, '.created { color: red; }');
				writeTestFile(changedPath, 'export const Changed = () => 1;');
				writeTestFile(ignoredPath, '# After');
				rmSync(deletedPath);
				watcherEvents.emit('add', createdPath);
				watcherEvents.emit('change', changedPath);
				watcherEvents.emit('change', ignoredPath);
				watcherEvents.emit('unlink', deletedPath);
				await vi.waitFor(
					() =>
						expect(onChanges).toHaveBeenCalledWith({
							created: [path.resolve(createdPath)],
							changed: [path.resolve(changedPath)],
							deleted: [path.resolve(deletedPath)],
							bridge,
						}),
					{ timeout: 2000 },
				);
			} finally {
				await watcher.close();
			}

			expect(onChanges).toHaveBeenCalledTimes(1);
			expect(onChanges).toHaveBeenCalledWith({
				created: [path.resolve(createdPath)],
				changed: [path.resolve(changedPath)],
				deleted: [path.resolve(deletedPath)],
				bridge,
			});
		});

		test('flushes a sustained stream at the maximum debounce wait', async () => {
			const testId = 'processor-watch-max-wait';
			const config = await createIntegrationConfig(testId);
			vi.useFakeTimers();
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			const onChanges = vi.fn(async () => {});
			config.processors.set('max-wait-test', {
				getWatchConfig: () => ({ paths: [], extensions: ['.tsx'], onChanges }),
			} as never);
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherEvents as never);
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 150,
			});
			const changedPaths = Array.from({ length: 10 }, (_, index) =>
				path.join(config.absolutePaths.srcDir, `page-${index}.tsx`),
			);

			try {
				const subscription = watcher.createWatcherSubscription();
				watcherEvents.emit('ready');
				await subscription;

				for (const changedPath of changedPaths) {
					watcherEvents.emit('change', changedPath);
					await vi.advanceTimersByTimeAsync(100);
				}

				expect(onChanges).toHaveBeenCalledTimes(1);
				expect(onChanges).toHaveBeenCalledWith({
					created: [],
					changed: changedPaths.map((changedPath) => path.resolve(changedPath)),
					deleted: [],
					bridge,
				});

				const nextChangedPath = path.join(config.absolutePaths.srcDir, 'next.tsx');
				watcherEvents.emit('change', nextChangedPath);
				await vi.advanceTimersByTimeAsync(149);
				expect(onChanges).toHaveBeenCalledTimes(1);
				await vi.advanceTimersByTimeAsync(1);
				expect(onChanges).toHaveBeenCalledTimes(2);
			} finally {
				await watcher.close();
				vi.useRealTimers();
			}
		});

		test('fails watcher startup when the filesystem subscription never becomes ready', async () => {
			const testId = 'watcher-ready-timeout';
			const config = await createIntegrationConfig(testId);
			vi.useFakeTimers();
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherEvents as never);
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager: createMockHmrManager(),
				bridge: createMockBridge(),
			});

			try {
				const subscription = watcher.createWatcherSubscription();
				const rejection = expect(subscription).rejects.toThrow(
					'Filesystem watcher did not become ready within 30000ms',
				);
				await vi.advanceTimersByTimeAsync(30_000);
				await rejection;
				expect(watcherEvents.close).toHaveBeenCalledOnce();
			} finally {
				await watcher.close();
				vi.useRealTimers();
			}
		});

		test('closes the watcher when subscription startup fails', async () => {
			const testId = 'watcher-ready-error';
			const config = await createIntegrationConfig(testId);
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherEvents as never);
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager: createMockHmrManager(),
				bridge: createMockBridge(),
			});

			const subscription = watcher.createWatcherSubscription();
			const rejection = expect(subscription).rejects.toThrow('watcher startup failed');
			watcherEvents.emit('error', new Error('watcher startup failed'));
			await rejection;

			expect(watcherEvents.close).toHaveBeenCalledOnce();
		});

		test('rejects watcher startup when it is closed before ready', async () => {
			const testId = 'watcher-close-before-ready';
			const config = await createIntegrationConfig(testId);
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherEvents as never);
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager: createMockHmrManager(),
				bridge: createMockBridge(),
			});

			const subscription = watcher.createWatcherSubscription();
			const rejection = expect(subscription).rejects.toThrow('Filesystem watcher closed before it became ready');
			await watcher.close();
			await rejection;

			expect(watcherEvents.close).toHaveBeenCalledOnce();
		});

		test('should handle public file through handleFileChange', async () => {
			const testId = 'handle-public-change';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();

			createTestDir(path.join(testId, 'src', 'public'));
			createTestDir(path.join(testId, 'dist'));

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 0,
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 0,
			});

			const sourceFile = path.join(config.absolutePaths.srcDir, 'components', 'Button.tsx');
			const wouldBeDestFile = path.join(config.absolutePaths.distDir, 'components', 'Button.tsx');

			writeTestFile(sourceFile, 'export const Button = () => {}');

			await (watcher as any).handleFileChange(sourceFile);

			expect(existsSync(wouldBeDestFile)).toBe(false);
			expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(bridge.reload).toHaveBeenCalledTimes(1);
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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
				refreshRouterRoutesCallback: vi.fn(async () => {}),
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

	describe('Content collection MDX changes', () => {
		test('should notify watch-only processors and still delegate MDX to HMR', async () => {
			const testId = 'content-mdx-hmr';
			const config = await createIntegrationConfig(testId);
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			const onChanges = vi.fn(async () => {});

			config.processors.set('content', {
				getAssetCapabilities: vi.fn(() => []),
				getWatchConfig: vi.fn(() => ({
					paths: [path.join(config.absolutePaths.srcDir, 'content', 'docs')],
					extensions: ['mdx'],
					onChanges,
				})),
			} as never);

			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 0,
			});

			const mdxPath = path.join(config.absolutePaths.srcDir, 'content', 'docs', 'intro.mdx');
			writeTestFile(mdxPath, '---\ntitle: Intro\n---\n# Intro\n');

			await (watcher as any).processFileChange(mdxPath, 'change');

			expect(onChanges).toHaveBeenCalledWith({
				created: [],
				changed: [path.resolve(mdxPath)],
				deleted: [],
				bridge,
			});
			expect(hmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(bridge.reload).toHaveBeenCalledTimes(1);
		});
	});
});
