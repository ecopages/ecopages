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

type FakeFileEvents = EventEmitter & {
	add: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	getWatched: ReturnType<typeof vi.fn>;
};

describe('ProjectWatcher - Integration Tests', () => {
	const openWatchers: ProjectWatcher[] = [];

	const startWatcherWithFakeFileEvents = async (
		config: EcoPagesAppConfig,
		bridge = createMockBridge(),
		hmrManager = createMockHmrManager(),
	) => {
		const fileEvents: FakeFileEvents = Object.assign(new EventEmitter(), {
			add: vi.fn(),
			close: vi.fn(async () => {}),
			getWatched: vi.fn(() => ({})),
		});
		vi.spyOn(chokidar, 'watch').mockImplementation(() => {
			setTimeout(() => fileEvents.emit('ready'), 0);
			return fileEvents as never;
		});
		const watcher = new ProjectWatcher({
			config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager,
			bridge,
			changeDebounceMs: 0,
		});
		openWatchers.push(watcher);
		await watcher.createWatcherSubscription();
		return { fileEvents, bridge, hmrManager };
	};

	beforeEach(() => {
		if (existsSync(TEST_ROOT)) {
			rmSync(TEST_ROOT, { recursive: true, force: true });
		}
		mkdirSync(TEST_ROOT, { recursive: true });
	});

	afterEach(async () => {
		await Promise.all(openWatchers.splice(0).map((watcher) => watcher.close()));
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
			const newFile = path.join(sourceDirectory, 'new-post.ts');

			try {
				const fileWatcher = await watcher.createWatcherSubscription();
				await vi.waitFor(() => expect(fileWatcher.getWatched()).toHaveProperty(sourceDirectory));
				expect(watchEvents).toEqual([]);
				writeTestFile(newFile, 'export const newPost = {};\n');
				await vi.waitFor(
					() => expect(watchEvents).toContainEqual({ kind: 'created', path: path.resolve(newFile) }),
					{ timeout: 3000 },
				);
				expect(watchEvents).toEqual([{ kind: 'created', path: path.resolve(newFile) }]);
			} finally {
				await watcher.close();
			}

			expect(hmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(newFile)], { broadcast: true });
			expect(bridge.reload).not.toHaveBeenCalled();
		});
	});

	describe('Public Directory File Operations', () => {
		test('copies a file added to the public directory', async () => {
			const config = await createIntegrationConfig('public-file-add');
			const { fileEvents } = await startWatcherWithFakeFileEvents(config);
			const sourceFile = path.join(config.absolutePaths.publicDir, 'favicon.ico');
			const destFile = path.join(config.absolutePaths.distDir, 'favicon.ico');

			writeTestFile(sourceFile, 'fake-icon-data');
			fileEvents.emit('add', sourceFile);

			await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe('fake-icon-data'));
		});

		test('copies a file into the matching subdirectory in dist', async () => {
			const config = await createIntegrationConfig('public-subdir-add');
			const { fileEvents } = await startWatcherWithFakeFileEvents(config);
			const sourceFile = path.join(config.absolutePaths.publicDir, 'images', 'logo.png');
			const destFile = path.join(config.absolutePaths.distDir, 'images', 'logo.png');

			writeTestFile(sourceFile, 'fake-png-data');
			fileEvents.emit('add', sourceFile);

			await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe('fake-png-data'));
		});

		test('updates the dist copy when a public file changes', async () => {
			const config = await createIntegrationConfig('public-file-update');
			const { fileEvents } = await startWatcherWithFakeFileEvents(config);
			const sourceFile = path.join(config.absolutePaths.publicDir, 'robots.txt');
			const destFile = path.join(config.absolutePaths.distDir, 'robots.txt');

			writeTestFile(sourceFile, 'User-agent: *\nDisallow: /');
			fileEvents.emit('add', sourceFile);
			await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe('User-agent: *\nDisallow: /'));

			writeTestFile(sourceFile, 'User-agent: *\nAllow: /');
			fileEvents.emit('change', sourceFile);
			await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe('User-agent: *\nAllow: /'));
		});

		test('copies a file from a deeply nested public directory', async () => {
			const config = await createIntegrationConfig('public-deep-nesting');
			const { fileEvents } = await startWatcherWithFakeFileEvents(config);
			const sourceFile = path.join(config.absolutePaths.publicDir, 'assets', 'fonts', 'woff2', 'font.woff2');
			const destFile = path.join(config.absolutePaths.distDir, 'assets', 'fonts', 'woff2', 'font.woff2');

			writeTestFile(sourceFile, 'fake-font-binary-data');
			fileEvents.emit('add', sourceFile);

			await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe('fake-font-binary-data'));
		});

		test('reloads the browser after a public file is copied', async () => {
			const config = await createIntegrationConfig('public-reload-trigger');
			const { fileEvents, bridge } = await startWatcherWithFakeFileEvents(config);
			const sourceFile = path.join(config.absolutePaths.publicDir, 'manifest.json');

			writeTestFile(sourceFile, '{"name":"test"}');
			fileEvents.emit('add', sourceFile);

			await vi.waitFor(() => expect(bridge.reload).toHaveBeenCalledOnce());
			expect(existsSync(path.join(config.absolutePaths.distDir, 'manifest.json'))).toBe(true);
		});

		test('copies nothing for a public file that no longer exists', async () => {
			const config = await createIntegrationConfig('public-copy-missing');
			const { fileEvents, bridge } = await startWatcherWithFakeFileEvents(config);
			const missingFile = path.join(config.absolutePaths.publicDir, 'does-not-exist.txt');

			fileEvents.emit('change', missingFile);

			await vi.waitFor(() => expect(bridge.reload).toHaveBeenCalledOnce());
			expect(existsSync(path.join(config.absolutePaths.distDir, 'does-not-exist.txt'))).toBe(false);
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

		test('keeps events after a scheduled flush in the next batch while earlier work is queued', async () => {
			const testId = 'processor-watch-queued-max-wait';
			const config = await createIntegrationConfig(testId);
			vi.useFakeTimers();
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			const batches: string[][] = [];
			let releaseFirstBatch: () => void = () => {};
			const firstBatchGate = new Promise<void>((resolve) => {
				releaseFirstBatch = resolve;
			});
			let notifyFirstBatchStarted: () => void = () => {};
			const firstBatchStarted = new Promise<void>((resolve) => {
				notifyFirstBatchStarted = resolve;
			});
			let notifyLateBatchProcessed: () => void = () => {};
			const lateBatchProcessed = new Promise<void>((resolve) => {
				notifyLateBatchProcessed = resolve;
			});
			const latePath = path.join(config.absolutePaths.srcDir, 'late.tsx');
			const onChanges = vi.fn(async ({ changed }: { changed: string[] }) => {
				batches.push([...changed]);
				if (batches.length === 1) {
					notifyFirstBatchStarted();
					await firstBatchGate;
				}
				if (changed.includes(path.resolve(latePath))) {
					notifyLateBatchProcessed();
				}
			});
			config.processors.set('queued-max-wait-test', {
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
			const firstPath = path.join(config.absolutePaths.srcDir, 'first.tsx');
			const queuedPath = path.join(config.absolutePaths.srcDir, 'queued.tsx');

			try {
				const subscription = watcher.createWatcherSubscription();
				watcherEvents.emit('ready');
				await subscription;

				watcherEvents.emit('change', firstPath);
				await vi.advanceTimersByTimeAsync(150);
				await firstBatchStarted;

				watcherEvents.emit('change', queuedPath);
				for (let index = 0; index < 9; index += 1) {
					await vi.advanceTimersByTimeAsync(100);
					watcherEvents.emit('change', queuedPath);
				}
				await vi.advanceTimersByTimeAsync(100);

				watcherEvents.emit('change', latePath);
				await vi.advanceTimersByTimeAsync(150);
				releaseFirstBatch();
				await lateBatchProcessed;

				expect(batches).toEqual([
					[path.resolve(firstPath)],
					[path.resolve(queuedPath)],
					[path.resolve(latePath)],
				]);
			} finally {
				releaseFirstBatch();
				await watcher.close();
				vi.useRealTimers();
			}
		});

		test('drops a queued restart batch when the watcher closes before processing starts', async () => {
			const testId = 'processor-watch-close-queued-restart';
			const config = await createIntegrationConfig(testId);
			vi.useFakeTimers();
			const hmrManager = createMockHmrManager();
			const bridge = createMockBridge();
			let releaseFirstBatch: () => void = () => {};
			const firstBatchGate = new Promise<void>((resolve) => {
				releaseFirstBatch = resolve;
			});
			let notifyFirstBatchStarted: () => void = () => {};
			const firstBatchStarted = new Promise<void>((resolve) => {
				notifyFirstBatchStarted = resolve;
			});
			const onChanges = vi.fn(async () => {
				notifyFirstBatchStarted();
				await firstBatchGate;
			});
			config.processors.set('close-queued-restart-test', {
				getWatchConfig: () => ({ paths: [], extensions: ['.tsx'], onChanges }),
			} as never);
			const watcherEvents = Object.assign(new EventEmitter(), {
				add: vi.fn(),
				close: vi.fn(async () => {}),
				getWatched: vi.fn(() => ({})),
			});
			vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherEvents as never);
			const onRestartRequest = vi.fn(async () => {});
			const watcher = new ProjectWatcher({
				config,
				refreshRouterRoutesCallback: vi.fn(async () => {}),
				hmrManager,
				bridge,
				changeDebounceMs: 150,
				onRestartRequest,
			});
			const firstPath = path.join(config.absolutePaths.srcDir, 'first.tsx');

			try {
				const subscription = watcher.createWatcherSubscription();
				watcherEvents.emit('ready');
				await subscription;

				watcherEvents.emit('change', firstPath);
				await vi.advanceTimersByTimeAsync(150);
				await firstBatchStarted;

				watcherEvents.emit('change', config.absolutePaths.config);
				await vi.advanceTimersByTimeAsync(150);

				const closePromise = watcher.close();
				releaseFirstBatch();
				await closePromise;
				await vi.advanceTimersByTimeAsync(0);

				expect(onRestartRequest).not.toHaveBeenCalled();
			} finally {
				releaseFirstBatch();
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
			expect(hmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(sourceFile)], { broadcast: true });
			expect(bridge.reload).not.toHaveBeenCalled();
		});
	});

	describe('Multiple File Operations', () => {
		test('copies public files added one after another and reloads for each', async () => {
			const config = await createIntegrationConfig('multiple-sequential');
			const { fileEvents, bridge } = await startWatcherWithFakeFileEvents(config);

			const files = ['file1.txt', 'file2.txt', 'file3.txt'];
			for (const [index, filename] of files.entries()) {
				const sourceFile = path.join(config.absolutePaths.publicDir, filename);
				const destFile = path.join(config.absolutePaths.distDir, filename);

				writeTestFile(sourceFile, `content-of-${filename}`);
				fileEvents.emit('add', sourceFile);

				await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe(`content-of-${filename}`));
				await vi.waitFor(() => expect(bridge.reload).toHaveBeenCalledTimes(index + 1));
			}
		});

		test('copies public files of mixed types', async () => {
			const config = await createIntegrationConfig('mixed-file-types');
			const { fileEvents } = await startWatcherWithFakeFileEvents(config);

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
				fileEvents.emit('add', sourceFile);

				await vi.waitFor(() => expect(readFileSync(destFile, 'utf-8')).toBe(content));
			}
		});
	});

	describe('Content collection MDX changes', () => {
		test('should notify watch-only processors and still delegate MDX to HMR', async () => {
			const config = await createIntegrationConfig('content-mdx-hmr');
			const onChanges = vi.fn(async () => {});

			config.processors.set('content', {
				getAssetCapabilities: vi.fn(() => []),
				getWatchConfig: vi.fn(() => ({
					paths: [path.join(config.absolutePaths.srcDir, 'content', 'docs')],
					extensions: ['mdx'],
					onChanges,
				})),
			} as never);
			const { fileEvents, bridge, hmrManager } = await startWatcherWithFakeFileEvents(config);

			const mdxPath = path.join(config.absolutePaths.srcDir, 'content', 'docs', 'intro.mdx');
			writeTestFile(mdxPath, '---\ntitle: Intro\n---\n# Intro\n');

			fileEvents.emit('change', mdxPath);

			await vi.waitFor(() => expect(hmrManager.handleFileChanges).toHaveBeenCalledOnce());
			expect(onChanges).toHaveBeenCalledWith({
				created: [],
				changed: [path.resolve(mdxPath)],
				deleted: [],
				bridge,
			});
			expect(hmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(mdxPath)], { broadcast: true });
		});
	});
});
