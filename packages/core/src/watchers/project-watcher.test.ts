import { describe, expect, test, beforeEach, afterEach, vi, type Mock } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { mkdirSync, mkdtempSync, writeFileSync, utimesSync, rmSync, realpathSync, type Stats } from 'node:fs';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import { ProjectWatcher, type ProjectWatcherConfig } from './project-watcher';
import type { EcoPagesAppConfig, IHmrManager } from '../config/internal-types.ts';
import type { IClientBridge } from '../config/internal-types.ts';
import { finalizeEcoPagesConfig } from '../config/assembly/finalize-config.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import type { AppModuleLoaderContract } from '../build/server/app-module-loader.service.ts';
import {
	createMockHmrManager,
	createMockBridge,
	installFakeChokidar,
	registerMockEntrypoint,
	subscribeWithFakeChokidar,
	type FakeChokidarOptions,
} from './project-watcher.test-helpers.ts';

const createMockConfig = async (rootDir = '/test/project'): Promise<EcoPagesAppConfig> => {
	return await finalizeEcoPagesConfig({ rootDir });
};

/**
 * A processor that owns `.css` as a stylesheet asset and also watches `.tsx`.
 */
function stylesheetProcessor(onChanges: Mock<() => Promise<void>>): never {
	return {
		getWatchConfig: vi.fn(() => ({
			paths: ['/test/project/src'],
			extensions: ['.css', '.tsx'],
			onChanges,
		})),
		getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
		canProcessAsset: vi.fn(
			(kind: string, filepath?: string) => kind === 'stylesheet' && filepath?.endsWith('.css'),
		),
	} as never;
}

describe('ProjectWatcher', () => {
	let Config: EcoPagesAppConfig;
	let HmrManager: IHmrManager;
	let Bridge: IClientBridge;
	let RefreshCallback: Mock<() => Promise<void>>;

	beforeEach(async () => {
		Config = await createMockConfig();
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(async () => {});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const subscribe = (overrides: Partial<ProjectWatcherConfig> = {}, options?: FakeChokidarOptions) =>
		subscribeWithFakeChokidar(
			{
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 0,
				...overrides,
			},
			options,
		);

	describe('directory changes', () => {
		test('batches Chokidar Pages directory events into one route refresh', async () => {
			vi.useFakeTimers();
			const { emit } = await subscribe({ changeDebounceMs: 50 });
			const sourceDirectory = path.join(Config.absolutePaths.pagesDir, 'blog');
			const destinationDirectory = path.join(Config.absolutePaths.pagesDir, 'posts');

			void emit('addDir', sourceDirectory);
			void emit('unlinkDir', destinationDirectory);
			await vi.advanceTimersByTimeAsync(50);

			expect(RefreshCallback).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
			expect(Bridge.reload).not.toHaveBeenCalled();
		});

		test.each([
			['addDir', 'pagesDir', 1],
			['unlinkDir', 'pagesDir', 1],
			['addDir', 'componentsDir', 0],
			['unlinkDir', 'componentsDir', 0],
		] as const)('a %s event in the %s refreshes routes %i times', async (event, directory, refreshes) => {
			const { emit } = await subscribe();

			await emit(event, path.join(Config.absolutePaths[directory], 'blog'));

			expect(RefreshCallback).toHaveBeenCalledTimes(refreshes);
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
		});
	});

	describe('ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS', () => {
		afterEach(() => {
			vi.unstubAllEnvs();
		});

		test.each(['abc', '-5', 'Infinity'])(
			'falls back to the default window with a warning for %s',
			async (value) => {
				vi.useFakeTimers();
				vi.stubEnv('ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS', value);
				const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
				const { emit } = await subscribe({ changeDebounceMs: undefined });
				const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');

				void emit('change', pageFilePath);
				await vi.advanceTimersByTimeAsync(100);
				expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();

				await vi.advanceTimersByTimeAsync(60);
				expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
				expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS'));
			},
		);

		test('uses a valid value from the environment', async () => {
			vi.useFakeTimers();
			vi.stubEnv('ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS', '400');
			const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);
			const { emit } = await subscribe({ changeDebounceMs: undefined });

			void emit('change', path.join(Config.absolutePaths.pagesDir, 'contact.tsx'));
			await vi.advanceTimersByTimeAsync(300);
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(110);
			expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe('handleError', () => {
		test('should broadcast error message and log', () => {
			const watcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
			});
			const error = new Error('Test error');
			const errorLog = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);
			watcher.handleError(error);

			expect(HmrManager.broadcast).toHaveBeenCalledWith({
				type: 'error',
				message: 'Test error',
			});
			expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(error.stack ?? 'Test error'));
		});

		test('should handle non-Error objects', () => {
			const watcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
			});
			watcher.handleError('string error');

			expect(HmrManager.broadcast).not.toHaveBeenCalled();
		});
	});

	describe('file events', () => {
		/**
		 * One row per routing decision the watcher applies to a single file event.
		 *
		 * @remarks
		 * `planFileChange` in `development-invalidation.service.test.ts` owns the classification of a path. These rows own
		 * what the watcher does with that plan: copy the file, refresh routes, notify processors, delegate to HMR
		 * or reload the browser. Every row asserts all four effects, so a decision that leaks into another effect fails.
		 */
		interface RoutingCase {
			name: string;
			file: (config: EcoPagesAppConfig) => string;
			event?: 'change' | 'add' | 'unlink';
			arrange?: (context: {
				config: EcoPagesAppConfig;
				onChanges: Mock<() => Promise<void>>;
				hmr: IHmrManager;
			}) => void;
			expected: {
				hmr: { broadcast: boolean } | null;
				reload: boolean;
				refreshRoutes: boolean;
				processorNotified: boolean;
			};
		}

		const delegated = { hmr: { broadcast: true }, reload: false, refreshRoutes: false, processorNotified: false };
		const reloaded = { hmr: null, reload: true, refreshRoutes: false, processorNotified: false };

		const routingCases: RoutingCase[] = [
			{
				name: 'a public file',
				file: (c) => path.join(c.absolutePaths.publicDir, 'favicon.ico'),
				expected: reloaded,
			},
			{
				name: 'a public file in a subdirectory',
				file: (c) => path.join(c.absolutePaths.publicDir, 'images', 'logo.png'),
				expected: reloaded,
			},
			{
				name: 'a public file before a catch-all additionalWatchPaths glob',
				file: (c) => path.join(c.absolutePaths.publicDir, 'icon.png'),
				arrange: ({ config }) => {
					config.additionalWatchPaths = ['**/*'];
				},
				expected: reloaded,
			},
			{
				name: 'a page',
				file: (c) => path.join(c.absolutePaths.pagesDir, 'about.tsx'),
				expected: { ...delegated, refreshRoutes: true },
			},
			{
				name: 'a page registered as an HMR entrypoint',
				file: (c) => path.join(c.absolutePaths.pagesDir, 'contact.tsx'),
				arrange: ({ config, hmr }) =>
					registerMockEntrypoint(hmr, path.join(config.absolutePaths.pagesDir, 'contact.tsx')),
				expected: { ...delegated, refreshRoutes: true },
			},
			{
				name: 'a page that is created',
				file: (c) => path.join(c.absolutePaths.pagesDir, 'new-page.tsx'),
				event: 'add',
				expected: { ...delegated, refreshRoutes: true },
			},
			{
				name: 'a stylesheet in the pages directory',
				file: (c) => path.join(c.absolutePaths.pagesDir, 'index.css'),
				expected: delegated,
			},
			{
				name: 'an include template',
				file: (c) => path.join(c.absolutePaths.includesDir, 'seo.kita.tsx'),
				expected: delegated,
			},
			{
				name: 'an include template with a processor that watches it',
				file: (c) => path.join(c.absolutePaths.includesDir, 'seo.kita.tsx'),
				arrange: ({ config, onChanges }) => config.processors.set('css', stylesheetProcessor(onChanges)),
				expected: { ...delegated, processorNotified: true },
			},
			{
				name: 'a registered script entrypoint with a processor that watches it',
				file: (c) => path.join(c.absolutePaths.srcDir, 'components/theme-toggle.tsx'),
				arrange: ({ config, onChanges, hmr }) => {
					const scriptPath = path.join(config.absolutePaths.srcDir, 'components/theme-toggle.tsx');
					config.processors.set('css', stylesheetProcessor(onChanges));
					registerMockEntrypoint(hmr, scriptPath, 'script');
				},
				expected: { ...delegated, processorNotified: true },
			},
			{
				name: 'a source file with no processors',
				file: (c) => path.join(c.absolutePaths.componentsDir, 'Button.tsx'),
				expected: delegated,
			},
			{
				name: 'a source file shared by a server route and a browser entrypoint',
				file: (c) => path.join(c.absolutePaths.componentsDir, 'Shared.tsx'),
				arrange: ({ config }) => {
					const sharedFile = path.join(config.absolutePaths.componentsDir, 'Shared.tsx');
					requireAppRuntime(config).buildInputIndex.register(
						{ consumer: 'server-route-module', key: path.join(config.absolutePaths.pagesDir, 'index.tsx') },
						[sharedFile],
					);
					requireAppRuntime(config).buildInputIndex.register(
						{ consumer: 'entrypoint', key: path.join(config.absolutePaths.componentsDir, 'island.tsx') },
						[sharedFile],
					);
				},
				expected: { hmr: { broadcast: false }, reload: true, refreshRoutes: false, processorNotified: false },
			},
			{
				name: 'a source file that no additionalWatchPaths entry matches',
				file: (c) => path.join(c.absolutePaths.componentsDir, 'Button.tsx'),
				arrange: ({ config }) => {
					config.additionalWatchPaths = ['**/*.config.ts'];
				},
				expected: delegated,
			},
			{
				name: 'a source file a processor does not handle',
				file: (c) => path.join(c.absolutePaths.srcDir, 'app.js'),
				arrange: ({ config }) =>
					config.processors.set('css', {
						getWatchConfig: vi.fn(() => ({ paths: ['/test/project/src'], extensions: ['.css'] })),
					} as never),
				expected: delegated,
			},
			{
				name: 'a source file when a processor has no watch config',
				file: (c) => path.join(c.absolutePaths.srcDir, 'app.js'),
				arrange: ({ config }) =>
					config.processors.set('no-watch', { getWatchConfig: vi.fn(() => null) } as never),
				expected: delegated,
			},
			{
				name: 'a source file with a processor that only owns stylesheet assets',
				file: (c) => path.join(c.absolutePaths.componentsDir, 'Button.tsx'),
				arrange: ({ config, onChanges }) => config.processors.set('css', stylesheetProcessor(onChanges)),
				expected: { ...delegated, processorNotified: true },
			},
			{
				name: 'a deleted source file',
				file: (c) => path.join(c.absolutePaths.componentsDir, 'Button.tsx'),
				event: 'unlink',
				expected: { hmr: { broadcast: false }, reload: true, refreshRoutes: false, processorNotified: false },
			},
			{
				name: 'a processor-owned stylesheet',
				file: (c) => path.join(c.absolutePaths.srcDir, 'styles', 'main.css'),
				arrange: ({ config, onChanges }) => config.processors.set('css', stylesheetProcessor(onChanges)),
				expected: { hmr: null, reload: false, refreshRoutes: false, processorNotified: true },
			},
			{
				name: 'a script asset a processor owns',
				file: (c) => path.join(c.absolutePaths.srcDir, 'content.mdx'),
				arrange: ({ config }) =>
					config.processors.set('mdx', {
						getWatchConfig: vi.fn(() => ({ paths: ['/test/project/src'], extensions: ['.mdx'] })),
						getAssetCapabilities: vi.fn(() => [{ kind: 'script', extensions: ['*.mdx'] }]),
						canProcessAsset: vi.fn(
							(kind: string, filepath?: string) => kind === 'script' && filepath?.endsWith('.mdx'),
						),
					} as never),
				expected: { hmr: null, reload: false, refreshRoutes: false, processorNotified: false },
			},
			{
				name: 'a file matching an additionalWatchPaths glob',
				file: () => '/test/project/app.config.ts',
				arrange: ({ config }) => {
					config.additionalWatchPaths = ['**/*.config.ts'];
				},
				expected: reloaded,
			},
			{
				name: 'a file named exactly by additionalWatchPaths',
				file: () => '/test/project/tailwind.config.ts',
				arrange: ({ config }) => {
					config.additionalWatchPaths = ['/test/project/tailwind.config.ts'];
				},
				expected: reloaded,
			},
			{
				name: 'an additionalWatchPaths file a processor also watches',
				file: () => '/test/project/app.config.ts',
				arrange: ({ config, onChanges }) => {
					config.additionalWatchPaths = ['**/*.config.ts'];
					config.processors.set('ts', {
						getWatchConfig: vi.fn(() => ({ paths: ['/test/project'], extensions: ['.ts'], onChanges })),
					} as never);
				},
				expected: { ...reloaded, processorNotified: true },
			},
		];

		test.each(routingCases)('routes $name', async ({ file, event = 'change', arrange, expected }) => {
			const onChanges = vi.fn(async () => {});
			arrange?.({ config: Config, onChanges, hmr: HmrManager });
			const filePath = file(Config);
			const { emit } = await subscribe();

			await emit(event, filePath);

			if (expected.hmr) {
				expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
				expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(filePath)], expected.hmr);
			} else {
				expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
			}
			expect(Bridge.reload).toHaveBeenCalledTimes(expected.reload ? 1 : 0);
			expect(RefreshCallback).toHaveBeenCalledTimes(expected.refreshRoutes ? 1 : 0);
			if (expected.processorNotified) {
				expect(onChanges).toHaveBeenCalledOnce();
				expect(onChanges).toHaveBeenCalledWith({
					created: event === 'add' ? [path.resolve(filePath)] : [],
					changed: event === 'change' ? [path.resolve(filePath)] : [],
					deleted: event === 'unlink' ? [path.resolve(filePath)] : [],
					bridge: Bridge,
				});
			} else {
				expect(onChanges).not.toHaveBeenCalled();
			}
		});

		test('should only invalidate server modules for route and server source changes', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');
			const cssFilePath = path.join(Config.absolutePaths.srcDir, 'styles', 'main.css');
			const moduleLoader = requireAppRuntime(Config).moduleLoader;
			Config.processors.set('css', stylesheetProcessor(vi.fn(async () => {})));
			const { emit } = await subscribe();

			expect(moduleLoader.getDevelopmentGeneration()).toBe(0);

			await emit('change', pageFilePath);
			expect(moduleLoader.getDevelopmentGeneration()).toBe(1);

			await emit('change', cssFilePath);
			expect(moduleLoader.getDevelopmentGeneration()).toBe(1);
		});

		test('delegates dotenv changes to the runtime restart owner', async () => {
			const onRestartRequest = vi.fn(async () => {});
			const { emit } = await subscribe({ onRestartRequest });
			const envPath = path.join(Config.rootDir, '.env.local');

			await emit('change', envPath);

			await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
			expect(onRestartRequest).toHaveBeenCalledWith(envPath);
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
			expect(Bridge.reload).not.toHaveBeenCalled();
		});

		test('lets a restart owner close the watcher without waiting on its own change task', async () => {
			let restartWatcher: ProjectWatcher | undefined;
			const onRestartRequest = vi.fn(async () => {
				await restartWatcher?.close();
			});
			const subscription = await subscribe({ onRestartRequest });
			restartWatcher = subscription.watcher;

			await subscription.emit('change', path.join(Config.rootDir, '.env'));

			await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
			await expect(onRestartRequest.mock.results[0]?.value).resolves.toBeUndefined();
		});

		test('leaves config-module changes to the entry watcher when configured', async () => {
			const onRestartRequest = vi.fn(async () => {});
			const { emit } = await subscribe({ onRestartRequest, entryWatcherOwnsConfig: true });

			await emit('change', Config.absolutePaths.config);

			expect(onRestartRequest).not.toHaveBeenCalled();
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(requireAppRuntime(Config).moduleLoader.getDevelopmentGeneration()).toBe(0);
		});

		test('restarts when a file the config imports changes, even if the entry watcher owns the config', async () => {
			const optionsPath = path.join(Config.rootDir, 'mdx-plugin-options.ts');
			Config.absolutePaths.configModuleFiles = [Config.absolutePaths.config, optionsPath];
			const onRestartRequest = vi.fn(async () => {});
			const { emit } = await subscribe({ onRestartRequest, entryWatcherOwnsConfig: true });

			await emit('change', optionsPath);

			await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
			expect(onRestartRequest).toHaveBeenCalledWith(optionsPath);
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();
		});

		test('marks an unopened page dirty without rebuilding it', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');
			let imported = false;
			requireAppRuntime(Config).moduleLoader = {
				importModule: async <T = unknown>() => {
					imported = true;
					return {} as T;
				},
				invalidateDevelopmentGraph: vi.fn(() => {}),
				getDevelopmentGeneration: () => 0,
			} satisfies AppModuleLoaderContract;
			const { emit } = await subscribe();

			await emit('change', pageFilePath);

			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(pageFilePath)], {
				broadcast: true,
			});
			expect(imported).toBe(false);
			expect(Bridge.reload).not.toHaveBeenCalled();
		});

		test('should await route refresh before broadcasting a browser update', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');
			let releaseRefresh!: () => void;
			const refreshGate = new Promise<void>((resolve) => {
				releaseRefresh = resolve;
			});
			const asyncRefreshCallback = vi.fn(async () => {
				await refreshGate;
			});
			const { emit } = await subscribe({ refreshRouterRoutesCallback: asyncRefreshCallback });

			const pendingChange = emit('add', pageFilePath);
			await vi.waitFor(() => {
				expect(asyncRefreshCallback).toHaveBeenCalledTimes(1);
			});
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();

			releaseRefresh();
			await pendingChange;

			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(pageFilePath)], {
				broadcast: true,
			});
			expect(Bridge.reload).not.toHaveBeenCalled();
		});

		test('notifies the remaining processors and the browser when one processor fails', async () => {
			const failure = new Error('stylesheet rebuild failed');
			const failingOnChanges = vi.fn(async () => {
				throw failure;
			});
			const onChanges = vi.fn(async () => {});
			const watchConfig = (handler: typeof onChanges) => ({
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.tsx'],
					onChanges: handler,
				})),
				getAssetCapabilities: vi.fn(() => []),
			});
			Config.processors.set('failing', { name: 'failing', ...watchConfig(failingOnChanges) } as never);
			Config.processors.set('working', { name: 'working', ...watchConfig(onChanges) } as never);
			const errorLog = vi.spyOn(appLogger, 'error').mockImplementation(() => appLogger);
			const includeFilePath = path.join(Config.absolutePaths.includesDir, 'seo.kita.tsx');
			const { emit } = await subscribe();

			await emit('change', includeFilePath);

			expect(failingOnChanges).toHaveBeenCalledOnce();
			expect(onChanges).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(includeFilePath)], {
				broadcast: true,
			});
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('failing'), failure);
		});

		test('should send every HMR-eligible edit in one batch to HMR strategies', async () => {
			const onChanges = vi.fn(async () => {});
			Config.processors.set('css', stylesheetProcessor(onChanges));
			const firstFilePath = path.join(Config.absolutePaths.componentsDir, 'Button.tsx');
			const secondFilePath = path.join(Config.absolutePaths.componentsDir, 'Card.tsx');
			const { emit } = await subscribe({ changeDebounceMs: 20 });

			await Promise.all([emit('change', firstFilePath), emit('change', secondFilePath)]);

			expect(onChanges).toHaveBeenCalledWith({
				created: [],
				changed: [path.resolve(firstFilePath), path.resolve(secondFilePath)],
				deleted: [],
				bridge: Bridge,
			});
			expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith(
				[path.resolve(firstFilePath), path.resolve(secondFilePath)],
				{ broadcast: true },
			);
			expect(Bridge.reload).not.toHaveBeenCalled();
		});

		test('should coalesce duplicate save events for the same page within the debounce window', async () => {
			vi.useFakeTimers();
			const { emit } = await subscribe({ changeDebounceMs: 150 });
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');

			void emit('change', pageFilePath);
			void emit('change', pageFilePath);
			await vi.runAllTimersAsync();

			expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(pageFilePath)], {
				broadcast: true,
			});
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(RefreshCallback).toHaveBeenCalledTimes(1);
		});

		test('applies fifty page edits in one debounce window with one invalidation and one browser update', async () => {
			vi.useFakeTimers();
			const { emit } = await subscribe({ changeDebounceMs: 150 });
			const moduleLoader = requireAppRuntime(Config).moduleLoader;

			for (let index = 0; index < 50; index += 1) {
				void emit('change', path.join(Config.absolutePaths.pagesDir, `page-${index}.tsx`));
			}
			await vi.runAllTimersAsync();

			expect(moduleLoader.getDevelopmentGeneration()).toBe(1);
			expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith(
				Array.from({ length: 50 }, (_, index) =>
					path.resolve(Config.absolutePaths.pagesDir, `page-${index}.tsx`),
				),
				{ broadcast: true },
			);
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(RefreshCallback).toHaveBeenCalledTimes(1);
		});

		test('refreshes routes and reloads once when a page is created and another is deleted in the same batch', async () => {
			vi.useFakeTimers();
			const { emit } = await subscribe({ changeDebounceMs: 150 });

			void emit('add', path.join(Config.absolutePaths.pagesDir, 'created.tsx'));
			void emit('unlink', path.join(Config.absolutePaths.pagesDir, 'deleted.tsx'));
			await vi.runAllTimersAsync();

			expect(RefreshCallback).toHaveBeenCalledTimes(1);
			expect(HmrManager.handleFileChanges).toHaveBeenCalledOnce();
			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith(
				[
					path.resolve(Config.absolutePaths.pagesDir, 'created.tsx'),
					path.resolve(Config.absolutePaths.pagesDir, 'deleted.tsx'),
				],
				{ broadcast: false },
			);
			expect(Bridge.reload).toHaveBeenCalledOnce();
		});

		test('reports a processing error to the browser and keeps handling later events', async () => {
			RefreshCallback.mockRejectedValueOnce(new Error('HMR error'));
			const { emit } = await subscribe();
			const filePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');

			await emit('change', filePath);

			expect(HmrManager.broadcast).toHaveBeenCalledTimes(1);
			expect(HmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'HMR error' });
			expect(Bridge.error).not.toHaveBeenCalled();
			expect(HmrManager.handleFileChanges).not.toHaveBeenCalled();

			await emit('change', filePath);

			expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(filePath)], { broadcast: true });
		});
	});

	describe('watch subscriptions', () => {
		test('watches the source tree, Processor paths, and runtime restart files', async () => {
			Config.processors.set('css', {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/custom-watch'],
					extensions: ['.css'],
				})),
			} as never);

			const { watch, handle } = await subscribe();

			const [watchedPaths, watchOptions] = watch.mock.calls[0] ?? [];
			expect(watchOptions).toMatchObject({ ignoreInitial: true });
			expect(watchedPaths).toEqual(
				expect.arrayContaining([
					Config.absolutePaths.srcDir,
					'/test/project/custom-watch',
					Config.absolutePaths.config,
				]),
			);
			for (const sourceDir of [
				Config.absolutePaths.pagesDir,
				Config.absolutePaths.componentsDir,
				Config.absolutePaths.includesDir,
				Config.absolutePaths.layoutsDir,
				Config.absolutePaths.publicDir,
			]) {
				expect(watchedPaths).not.toContain(sourceDir);
			}
			expect(handle.add).not.toHaveBeenCalled();
		});

		test('watches a configured source directory that resolves outside srcDir', async () => {
			const outsidePublicDir = '/test/project/public';
			Config.absolutePaths.publicDir = outsidePublicDir;
			vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath) => String(targetPath) === outsidePublicDir);

			const { watch } = await subscribe();

			expect(watch.mock.calls[0]?.[0]).toContain(outsidePublicDir);
		});

		test('watches recorded paths outside srcDir directly and leaves source inputs to the srcDir watch', async () => {
			const sourceInput = path.join(Config.absolutePaths.srcDir, 'lib/posts.ts');
			const externalInput = path.join(Config.rootDir, '../shared/data/posts.json');
			const buildInputIndex = requireAppRuntime(Config).buildInputIndex;
			buildInputIndex.recordWatchPath(sourceInput);
			buildInputIndex.recordWatchPath(externalInput);

			const { watch } = await subscribe();

			const watchedPaths = watch.mock.calls[0]?.[0] ?? [];
			expect(watchedPaths).toContain(Config.absolutePaths.srcDir);
			expect(watchedPaths).toContain(externalInput);
			expect(watchedPaths).not.toContain(sourceInput);
		});

		test('waits for filesystem subscriptions to be ready before startup completes', async () => {
			const fake = installFakeChokidar({ ready: 'manual' });
			const watcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
			});
			let completed = false;
			const subscription = watcher.createWatcherSubscription().then((result) => {
				completed = true;
				return result;
			});
			await Promise.resolve();
			expect(completed).toBe(false);

			await fake.emit('ready');

			expect(await subscription).toBe(fake.handle);
			await watcher.close();
		});

		test.each(['fresh', 'preserved'])(
			'processes a new source file with %s timestamps immediately after subscription',
			async (timestamps) => {
				const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'eco-watch-create-')));
				try {
					mkdirSync(path.join(root, 'src/components'), { recursive: true });
					Config = await finalizeEcoPagesConfig({ rootDir: root, integrations: [] });
					const { emit } = await subscribe();
					const componentFile = path.join(root, 'src/components/new-widget.tsx');
					writeFileSync(componentFile, 'export default function Widget() { return null; }\n');
					if (timestamps === 'preserved') {
						const past = new Date(Date.now() - 60_000);
						utimesSync(componentFile, past, past);
					}

					await emit('add', componentFile);

					expect(requireAppRuntime(Config).moduleLoader.getDevelopmentGeneration()).toBe(1);
					expect(HmrManager.handleFileChanges).toHaveBeenCalledWith([path.resolve(componentFile)], {
						broadcast: true,
					});
					expect(Bridge.reload).not.toHaveBeenCalled();
				} finally {
					rmSync(root, { recursive: true, force: true });
				}
			},
		);

		test('watches every supported dotenv path before the files exist', async () => {
			const { watch } = await subscribe();

			expect(watch).toHaveBeenCalledWith(
				expect.arrayContaining([
					path.join(Config.rootDir, '.env'),
					path.join(Config.rootDir, '.env.local'),
					path.join(Config.rootDir, '.env.test'),
					path.join(Config.rootDir, '.env.test.local'),
				]),
				expect.any(Object),
			);
		});

		test.each([
			['/test/project', 'content/**/*.md', '/test/project/content'],
			['/test/project', '**/*.config.ts', '/test/project'],
			['/test/project', '../shared/**/*.ts', '/test/shared'],
			['/home/me/[client]/site', 'content/**/*.md', '/home/me/[client]/site/content'],
		])(
			'watches the static base directory of the %s root %s glob before it exists',
			async (rootDir, pattern, base) => {
				Config = await createMockConfig(rootDir);
				Config.additionalWatchPaths = [pattern];
				vi.spyOn(fileSystem, 'exists').mockReturnValue(false);

				const { watch } = await subscribe();

				const watchedPaths = [watch.mock.calls[0]?.[0] ?? []].flat();
				expect(watchedPaths).toContain(base);
				expect(watchedPaths.filter((watchedPath) => watchedPath.includes('*'))).toEqual([]);
			},
		);

		test('warns when an additionalWatchPaths glob watches the filesystem root', async () => {
			Config.additionalWatchPaths = ['/**/*.md'];
			const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);

			await subscribe();

			expect(warn).toHaveBeenCalledWith(expect.stringContaining('"/**/*.md" watches the filesystem root'));
		});

		test('ignores files reached only through a glob base unless they match the glob', async () => {
			Config.additionalWatchPaths = ['**/*.config.ts'];
			vi.spyOn(fileSystem, 'exists').mockImplementation(
				(targetPath) => String(targetPath) === Config.absolutePaths.srcDir,
			);

			const { watch } = await subscribe();

			const ignored = watch.mock.calls[0]?.[1]?.ignored as (watchedPath: string, stats?: Stats) => boolean;
			const file = { isFile: () => true, isDirectory: () => false } as Stats;
			const directory = { isFile: () => false, isDirectory: () => true } as Stats;
			expect(ignored('/test/project/README.md')).toBe(false);
			expect(ignored('/test/project/README.md', file)).toBe(true);
			expect(ignored('/test/project/docs', directory)).toBe(false);
			expect(ignored('/test/project/.cache', directory)).toBe(true);
			expect(ignored('/test/project/vite.config.ts', file)).toBe(false);
			expect(ignored(path.join(Config.absolutePaths.srcDir, 'components', 'Button.tsx'), file)).toBe(false);
		});

		test('ignores node_modules, .git, workDir, and distDir via a path predicate (chokidar v4+ has no glob support)', async () => {
			vi.spyOn(fileSystem, 'exists').mockImplementation(
				(targetPath) => String(targetPath) === Config.absolutePaths.srcDir,
			);

			const { watch } = await subscribe();

			const ignored = watch.mock.calls[0]?.[1]?.ignored as (watchedPath: string) => boolean;
			expect(ignored(path.join(Config.absolutePaths.srcDir, 'node_modules', 'react', 'index.js'))).toBe(true);
			expect(ignored(path.join(Config.absolutePaths.srcDir, 'components', 'Button.tsx'))).toBe(false);
		});

		test('should attach chokidar handlers only once when watcher subscription is requested twice', async () => {
			const { watcher, watch, handle } = await subscribe();

			await watcher.createWatcherSubscription();

			expect(watch).toHaveBeenCalledTimes(1);
			expect(handle.on).toHaveBeenCalledTimes(6);
		});
	});
});
