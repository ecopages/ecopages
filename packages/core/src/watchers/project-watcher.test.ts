import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import type { Stats } from 'node:fs';
import chokidar from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../global/app-logger.ts';
import { ProjectWatcher } from './project-watcher';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge.ts';
import { finalizeEcoPagesConfig } from '../config/finalize-config.ts';
import { DEV_TRANSFORM_URL_PREFIX } from '../dev/transform-server/dev-transform-url.ts';
import { getAppServerInvalidationState } from '../services/runtime-state/server-invalidation-state.service.ts';
import { getAppBuildInputIndex } from '../build/cache/build-input-dependency-index.ts';
import {
	createMockHmrManager,
	createMockBridge,
	installDevRuntimeState,
	registerMockEntrypoint,
} from './project-watcher.test-helpers.ts';

function expectHmrDelegated(hmrManager: IHmrManager, filePath: string): void {
	expect(hmrManager.handleFileChange).toHaveBeenCalledWith(
		path.resolve(filePath),
		expect.objectContaining({ graphIdentities: expect.any(Array) }),
	);
}

async function handleWatcherFileChange(watcher: ProjectWatcher, filePath: string): Promise<void> {
	await (
		watcher as unknown as {
			handleFileChange(filePath: string): Promise<void>;
		}
	).handleFileChange(filePath);
}

const createMockConfig = async (rootDir = '/test/project'): Promise<EcoPagesAppConfig> => {
	return await finalizeEcoPagesConfig({ rootDir });
};

describe('ProjectWatcher', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;
	let HmrManager: IHmrManager;
	let Bridge: ClientBridge;
	let RefreshCallback: any;

	beforeEach(async () => {
		Config = await createMockConfig();
		installDevRuntimeState(Config);
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(async () => {});

		watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('constructor', () => {
		test('should initialize with provided config', () => {
			expect(watcher).toBeDefined();
		});

		test('should bind callback methods correctly', () => {
			expect(typeof watcher.triggerRouterRefresh).toBe('function');
			expect(typeof watcher.handleError).toBe('function');
		});
	});

	describe('triggerRouterRefresh', () => {
		test('should call refresh callback for page directory changes', async () => {
			const pagePath = path.join(Config.absolutePaths.pagesDir, 'index.tsx');
			await watcher.triggerRouterRefresh(pagePath);

			expect(RefreshCallback).toHaveBeenCalled();
		});

		test('should not call refresh callback for stylesheet assets inside the pages directory', async () => {
			const stylesheetPath = path.join(Config.absolutePaths.pagesDir, 'index.css');
			await watcher.triggerRouterRefresh(stylesheetPath);

			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should not call refresh callback for a sibling directory that shares the pages prefix', async () => {
			await watcher.triggerRouterRefresh(`${Config.absolutePaths.pagesDir}-old`);

			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should not call refresh callback for non-page directory changes', async () => {
			const nonPagePath = '/test/project/src/components/Button.tsx';
			await watcher.triggerRouterRefresh(nonPagePath);

			expect(RefreshCallback).not.toHaveBeenCalled();
		});
	});

	describe('handleError', () => {
		test('should broadcast error message and log', () => {
			const error = new Error('Test error');
			watcher.handleError(error);

			expect(HmrManager.broadcast).toHaveBeenCalledWith({
				type: 'error',
				message: 'Test error',
			});
		});

		test('should handle non-Error objects', () => {
			watcher.handleError('string error');

			expect(HmrManager.broadcast).not.toHaveBeenCalled();
		});
	});
});

describe('ProjectWatcher - File Change Handling', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;
	let HmrManager: IHmrManager;
	let Bridge: ClientBridge;
	let RefreshCallback: any;

	beforeEach(async () => {
		Config = await createMockConfig();
		installDevRuntimeState(Config);
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(async () => {});

		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should only invalidate server modules for route and server source changes', async () => {
		const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');
		const cssFilePath = path.join(Config.absolutePaths.srcDir, 'styles', 'main.css');
		const serverInvalidationState = getAppServerInvalidationState(Config);

		Config.processors.set('css', {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project/src'],
				extensions: ['.css'],
			})),
			getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
			canProcessAsset: vi.fn(
				(kind: string, filepath?: string) => kind === 'stylesheet' && filepath?.endsWith('.css'),
			),
			matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
		} as never);

		expect(serverInvalidationState.getServerInvalidationVersion()).toBe(0);

		await (watcher as any).handleFileChange(pageFilePath);
		expect(serverInvalidationState.getServerInvalidationVersion()).toBe(1);

		await (watcher as any).handleFileChange(cssFilePath);
		expect(serverInvalidationState.getServerInvalidationVersion()).toBe(1);
	});

	test('delegates dotenv changes to the runtime restart owner', async () => {
		const onRestartRequest = vi.fn(async () => {});
		const restartWatcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
			onRestartRequest,
		});
		const envPath = path.join(Config.rootDir, '.env.local');

		await handleWatcherFileChange(restartWatcher, envPath);

		await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
		expect(onRestartRequest).toHaveBeenCalledWith(envPath);
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		expect(Bridge.reload).not.toHaveBeenCalled();
	});

	test('lets a restart owner close the watcher without waiting on its own change task', async () => {
		let restartWatcher: ProjectWatcher;
		const onRestartRequest = vi.fn(async () => {
			await restartWatcher.close();
		});
		restartWatcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
			onRestartRequest,
		});

		await handleWatcherFileChange(restartWatcher, path.join(Config.rootDir, '.env'));

		await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
		await expect(onRestartRequest.mock.results[0]?.value).resolves.toBeUndefined();
	});

	test('leaves config-module changes to the entry watcher when configured', async () => {
		const onRestartRequest = vi.fn(async () => {});
		const restartWatcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
			onRestartRequest,
			entryWatcherOwnsConfig: true,
		});

		await handleWatcherFileChange(restartWatcher, Config.absolutePaths.config);

		expect(onRestartRequest).not.toHaveBeenCalled();
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('restarts when a file the config imports changes, even if the entry watcher owns the config', async () => {
		const optionsPath = path.join(Config.rootDir, 'mdx-plugin-options.ts');
		Config.absolutePaths.configModuleFiles = [Config.absolutePaths.config, optionsPath];
		const onRestartRequest = vi.fn(async () => {});
		const restartWatcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
			onRestartRequest,
			entryWatcherOwnsConfig: true,
		});

		await handleWatcherFileChange(restartWatcher, optionsPath);

		await vi.waitFor(() => expect(onRestartRequest).toHaveBeenCalledOnce());
		expect(onRestartRequest).toHaveBeenCalledWith(optionsPath);
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	describe('public directory files', () => {
		test('should handle public file changes with single-file copy', async () => {
			const publicFilePath = path.join(Config.absolutePaths.publicDir, 'favicon.ico');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(Bridge.reload).toHaveBeenCalled();
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should handle public file in subdirectory', async () => {
			const publicFilePath = path.join(Config.absolutePaths.publicDir, 'images', 'logo.png');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(Bridge.reload).toHaveBeenCalled();
		});

		test('should not call uncacheModules for public files', async () => {
			const publicFilePath = path.join(Config.absolutePaths.publicDir, 'robots.txt');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		});
	});

	describe('page files', () => {
		test('should refresh router for page file changes', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');

			await (watcher as any).handleFileChange(pageFilePath);

			expect(RefreshCallback).toHaveBeenCalled();
		});

		test('marks an unopened page dirty without rebuilding it', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');
			let imported = false;
			Config.runtime = {
				...(Config.runtime ?? {}),
				appModuleLoader: {
					importModule: async <T = unknown>() => {
						imported = true;
						return {} as T;
					},
					invalidateDevelopmentGraph: vi.fn(() => {}),
				},
			};

			await (watcher as any).handleFileChange(pageFilePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(imported).toBe(false);
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});

		test('delegates an open page to HMR after marking it dirty', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');
			registerMockEntrypoint(HmrManager, pageFilePath);

			await (watcher as any).handleFileChange(pageFilePath);

			expectHmrDelegated(HmrManager, pageFilePath);
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

			watcher = new ProjectWatcher({
				config: Config as EcoPagesAppConfig,
				refreshRouterRoutesCallback: asyncRefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 0,
			});

			const pendingChange = (watcher as any).handleFileChange(pageFilePath, 'add');
			await vi.waitFor(() => {
				expect(asyncRefreshCallback).toHaveBeenCalledTimes(1);
			});
			expect(Bridge.reload).not.toHaveBeenCalled();
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();

			releaseRefresh();
			await pendingChange;

			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});

		test('should not refresh router for stylesheet changes inside the pages directory', async () => {
			const pageCssPath = path.join(Config.absolutePaths.pagesDir, 'index.css');

			await (watcher as any).handleFileChange(pageCssPath);

			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should coalesce duplicate save events for the same page within the debounce window', async () => {
			vi.useFakeTimers();
			const debouncedWatcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 150,
			});
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');

			void (debouncedWatcher as any).handleFileChange(pageFilePath);
			void (debouncedWatcher as any).handleFileChange(pageFilePath);
			await vi.runAllTimersAsync();

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(RefreshCallback).toHaveBeenCalledTimes(1);
			vi.useRealTimers();
		});

		test('applies fifty page edits in one debounce window with one invalidation and one browser update', async () => {
			vi.useFakeTimers();
			const debouncedWatcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 150,
			});
			const serverInvalidationState = getAppServerInvalidationState(Config);

			for (let index = 0; index < 50; index += 1) {
				void (debouncedWatcher as any).handleFileChange(
					path.join(Config.absolutePaths.pagesDir, `page-${index}.tsx`),
				);
			}
			await vi.runAllTimersAsync();

			expect(serverInvalidationState.getServerInvalidationVersion()).toBe(1);
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(RefreshCallback).toHaveBeenCalledTimes(1);
			vi.useRealTimers();
		});

		test('refreshes routes once when a page is created and another is deleted in the same batch', async () => {
			vi.useFakeTimers();
			const debouncedWatcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 150,
			});

			void (debouncedWatcher as any).handleFileChange(
				path.join(Config.absolutePaths.pagesDir, 'created.tsx'),
				'add',
			);
			void (debouncedWatcher as any).handleFileChange(
				path.join(Config.absolutePaths.pagesDir, 'deleted.tsx'),
				'unlink',
			);
			await vi.runAllTimersAsync();

			expect(RefreshCallback).toHaveBeenCalledTimes(1);
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			vi.useRealTimers();
		});
	});

	describe('include files', () => {
		test('marks include template changes dirty and reloads the browser once', async () => {
			const includeFilePath = path.join(Config.absolutePaths.includesDir, 'seo.kita.tsx');

			await (watcher as any).handleFileChange(includeFilePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should defer processor notifications until after include template HMR handling', async () => {
			const onChange = vi.fn(async () => {});
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.tsx'],
					onChange,
				})),
				getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
				canProcessAsset: vi.fn((kind: string, filepath?: string) => {
					return kind === 'stylesheet' && filepath?.endsWith('.css');
				}),
				matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
			};
			Config.processors.set('css', Processor as any);

			const includeFilePath = path.join(Config.absolutePaths.includesDir, 'seo.kita.tsx');

			await (watcher as any).handleFileChange(includeFilePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			await new Promise<void>((resolve) => {
				setImmediate(resolve);
			});
			expect(onChange).toHaveBeenCalledWith({ path: path.resolve(includeFilePath), bridge: Bridge });
		});
	});

	describe('registered script entrypoints', () => {
		test('should defer processor notifications for registered script edits until after HMR handling', async () => {
			const onChange = vi.fn(async () => {});
			const scriptPath = path.join(Config.absolutePaths.srcDir, 'components/theme-toggle.tsx');
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.tsx'],
					onChange,
				})),
				getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
				canProcessAsset: vi.fn((kind: string, filepath?: string) => {
					return kind === 'stylesheet' && filepath?.endsWith('.css');
				}),
				matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
			};
			Config.processors.set('css', Processor as any);
			HmrManager.getWatchedFiles = vi.fn(
				() => new Map([[path.resolve(scriptPath), `${DEV_TRANSFORM_URL_PREFIX}/components/theme-toggle.js`]]),
			);
			registerMockEntrypoint(HmrManager, scriptPath, 'script');

			await (watcher as any).handleFileChange(scriptPath);

			expectHmrDelegated(HmrManager, scriptPath);
			expect(Bridge.reload).not.toHaveBeenCalled();
			await new Promise<void>((resolve) => {
				setImmediate(resolve);
			});
			expect(onChange).toHaveBeenCalledWith({ path: path.resolve(scriptPath), bridge: Bridge });
		});
	});

	describe('additionalWatchPaths', () => {
		test('should reload for files matching additionalWatchPaths pattern', async () => {
			Config.additionalWatchPaths = ['**/*.config.ts'];
			const configFilePath = '/test/project/app.config.ts';

			await (watcher as any).handleFileChange(configFilePath);

			expect(Bridge.reload).toHaveBeenCalled();
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should reload for exact path matches', async () => {
			const exactPath = '/test/project/tailwind.config.ts';
			Config.additionalWatchPaths = [exactPath];

			await (watcher as any).handleFileChange(exactPath);

			expect(Bridge.reload).toHaveBeenCalled();
		});

		test('should not reload for non-matching paths', async () => {
			Config.additionalWatchPaths = ['**/*.config.ts'];
			const nonMatchingPath = '/test/project/src/components/Button.tsx';

			await (watcher as any).handleFileChange(nonMatchingPath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});
	});

	describe('processor-handled files', () => {
		test('should skip HMR for processor-owned asset capabilities', async () => {
			const onChange = vi.fn(async () => {});
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
					onChange,
				})),
				getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css', '*.scss'] }]),
				canProcessAsset: vi.fn((kind: string, filepath?: string) => {
					return kind === 'stylesheet' && (filepath?.endsWith('.css') || filepath?.endsWith('.scss'));
				}),
			};
			Config.processors.set('css', Processor as any);

			const cssFilePath = '/test/project/src/styles/main.css';

			await (watcher as any).handleFileChange(cssFilePath);

			expect(onChange).toHaveBeenCalledWith({ path: path.resolve(cssFilePath), bridge: Bridge });
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should process files through HMR when not handled by processor', async () => {
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css'],
				})),
			};
			Config.processors.set('css', Processor as any);

			const jsFilePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(jsFilePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});

		test('should keep TSX changes in HMR when a processor only handles stylesheet assets', async () => {
			const onChange = vi.fn(async () => {});
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.tsx'],
					onChange,
				})),
				getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
				canProcessAsset: vi.fn((kind: string, filepath?: string) => {
					return kind === 'stylesheet' && filepath?.endsWith('.css');
				}),
				matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
			};
			Config.processors.set('css', Processor as any);

			const tsxFilePath = '/test/project/src/components/Button.tsx';

			await (watcher as any).handleFileChange(tsxFilePath);

			expect(onChange).toHaveBeenCalledWith({ path: path.resolve(tsxFilePath), bridge: Bridge });
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});

		test('should route TSX through HMR even when no specific strategy matches', async () => {
			const onChange = vi.fn(async () => {});
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.tsx'],
					onChange,
				})),
				getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
				canProcessAsset: vi.fn((kind: string, filepath?: string) => {
					return kind === 'stylesheet' && filepath?.endsWith('.css');
				}),
				matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
			};
			Config.processors.set('css', Processor as any);

			const tsxFilePath = '/test/project/src/components/Button.tsx';

			await (watcher as any).handleFileChange(tsxFilePath);

			expect(onChange).toHaveBeenCalled();
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(HmrManager.broadcast).not.toHaveBeenCalledWith({ type: 'layout-update' });
		});

		test('should handle processor without watchConfig', async () => {
			const Processor = {
				getWatchConfig: vi.fn(() => null),
			};
			Config.processors.set('no-watch', Processor as any);

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
		});
	});

	describe('error handling', () => {
		test('should handle errors during file change processing', async () => {
			RefreshCallback = vi.fn(async () => {
				throw new Error('HMR error');
			});
			watcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 0,
			});
			const filePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');

			await (watcher as any).handleFileChange(filePath);

			expect(HmrManager.broadcast).toHaveBeenCalledTimes(1);
			expect(HmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'HMR error' });
			expect(Bridge.error).not.toHaveBeenCalled();
		});

		test('should continue processing after error', async () => {
			RefreshCallback = vi.fn(async () => {
				throw new Error('Processing failed');
			});
			watcher = new ProjectWatcher({
				config: Config,
				refreshRouterRoutesCallback: RefreshCallback,
				hmrManager: HmrManager,
				bridge: Bridge,
				changeDebounceMs: 0,
			});
			const filePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');

			await (watcher as any).handleFileChange(filePath);

			expect(HmrManager.broadcast).toHaveBeenCalledWith({ type: 'error', message: 'Processing failed' });
		});
	});
});

describe('ProjectWatcher - Priority Rules', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;
	let HmrManager: IHmrManager;
	let Bridge: ClientBridge;

	beforeEach(async () => {
		Config = await createMockConfig();
		installDevRuntimeState(Config);
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();

		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should prioritize public dir over additionalWatchPaths', async () => {
		Config.additionalWatchPaths = ['**/*'];
		const publicFilePath = path.join(Config.absolutePaths.publicDir, 'icon.png');

		await (watcher as any).handleFileChange(publicFilePath);

		expect(Bridge.reload).toHaveBeenCalledTimes(1);
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should prioritize additionalWatchPaths over processors', async () => {
		const onChange = vi.fn(async () => {});
		Config.additionalWatchPaths = ['**/*.config.ts'];
		const Processor = {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project'],
				extensions: ['.ts'],
				onChange,
			})),
		};
		Config.processors.set('ts', Processor as any);

		const configFilePath = '/test/project/app.config.ts';

		await (watcher as any).handleFileChange(configFilePath);

		expect(onChange).toHaveBeenCalledWith({ path: path.resolve(configFilePath), bridge: Bridge });
		expect(Bridge.reload).toHaveBeenCalled();
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should prioritize processor-owned assets over HMR strategies', async () => {
		const Processor = {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project/src'],
				extensions: ['.mdx'],
			})),
			getAssetCapabilities: vi.fn(() => [{ kind: 'script', extensions: ['*.mdx'] }]),
			canProcessAsset: vi.fn((kind: string, filepath?: string) => {
				return kind === 'script' && filepath?.endsWith('.mdx');
			}),
		};
		Config.processors.set('mdx', Processor as any);

		const mdxFilePath = '/test/project/src/content.mdx';

		await (watcher as any).handleFileChange(mdxFilePath);

		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should use HMR as final fallback', async () => {
		const regularFilePath = '/test/project/src/components/Button.tsx';

		await (watcher as any).handleFileChange(regularFilePath);

		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		expect(Bridge.reload).toHaveBeenCalledTimes(1);
	});

	test('should notify processor for dependency file before proceeding to HMR', async () => {
		const onChange = vi.fn(async () => {});
		const Processor = {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project/src'],
				extensions: ['.css', '.tsx'],
				onChange,
			})),
			getAssetCapabilities: vi.fn(() => [{ kind: 'stylesheet', extensions: ['*.css'] }]),
			canProcessAsset: vi.fn((kind: string, filepath?: string) => {
				return kind === 'stylesheet' && filepath?.endsWith('.css');
			}),
			matchesFileFilter: vi.fn((filepath: string) => filepath.endsWith('.css')),
		};
		Config.processors.set('css', Processor as any);

		const tsxFilePath = '/test/project/src/components/Button.tsx';

		await (watcher as any).handleFileChange(tsxFilePath);

		expect(onChange).toHaveBeenCalledWith({ path: path.resolve(tsxFilePath), bridge: Bridge });
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		expect(Bridge.reload).toHaveBeenCalledTimes(1);
	});
});

describe('ProjectWatcher - Watch Subscriptions', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should watch recorded Processor paths, pages, and public assets', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath) =>
			[Config.absolutePaths.pagesDir, Config.absolutePaths.publicDir].includes(String(targetPath)),
		);
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn().mockReturnThis(),
			close: vi.fn(),
		};
		const chokidarWatch = vi.fn(() => watcherHandle);

		vi.spyOn(chokidar, 'watch').mockImplementation(chokidarWatch as never);

		Config.processors.set('css', {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project/custom-watch'],
				extensions: ['.css'],
			})),
		} as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		expect(chokidarWatch).toHaveBeenCalledWith(
			expect.arrayContaining([
				'/test/project/custom-watch',
				Config.absolutePaths.pagesDir,
				Config.absolutePaths.publicDir,
			]),
			expect.any(Object),
		);
		expect(chokidarWatch).not.toHaveBeenCalledWith(
			expect.arrayContaining([Config.absolutePaths.includesDir, Config.absolutePaths.srcDir]),
			expect.any(Object),
		);
		expect(watcherHandle.add).not.toHaveBeenCalled();
	});

	test('does not treat chokidar add for a newly recorded existing file as a create', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		const recordedFile = path.join(Config.absolutePaths.srcDir, 'components/badge-buttons.ts');
		const HmrManager = createMockHmrManager();
		const Bridge = createMockBridge();
		const eventHandlers = new Map<string, (filePath: string) => void>();
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn((event: string, handler: (filePath: string) => void) => {
				eventHandlers.set(event, handler);
				return watcherHandle;
			}),
			close: vi.fn(),
		};
		vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath) =>
			[Config.absolutePaths.pagesDir, Config.absolutePaths.publicDir, recordedFile].includes(String(targetPath)),
		);
		vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherHandle as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();
		getAppBuildInputIndex(Config).recordWatchPath(recordedFile);
		expect(watcherHandle.add).toHaveBeenCalledWith(path.resolve(recordedFile));

		eventHandlers.get('add')?.(recordedFile);
		await (watcher as unknown as { changeQueue: Promise<void> }).changeQueue;

		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
		expect(Bridge.reload).not.toHaveBeenCalled();
	});

	test('watches every supported dotenv path before the files exist', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn().mockReturnThis(),
			close: vi.fn(),
		};
		const chokidarWatch = vi.fn(() => watcherHandle);
		vi.spyOn(chokidar, 'watch').mockImplementation(chokidarWatch as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
		});

		await watcher.createWatcherSubscription();

		expect(chokidarWatch).toHaveBeenCalledWith(
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
	])('watches the static base directory of the %s root %s glob before it exists', async (rootDir, pattern, base) => {
		const Config = await createMockConfig(rootDir);
		installDevRuntimeState(Config);
		Config.additionalWatchPaths = [pattern];
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const chokidarWatch = vi.fn((_paths: string[]) => ({
			add: vi.fn(),
			on: vi.fn().mockReturnThis(),
			close: vi.fn(),
		}));
		vi.spyOn(chokidar, 'watch').mockImplementation(chokidarWatch as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		const watchedPaths = chokidarWatch.mock.calls[0]?.[0] ?? [];
		expect(watchedPaths).toContain(base);
		expect(watchedPaths.filter((watchedPath) => watchedPath.includes('*'))).toEqual([]);
	});

	test('warns when an additionalWatchPaths glob watches the filesystem root', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		Config.additionalWatchPaths = ['/**/*.md'];
		vi.spyOn(chokidar, 'watch').mockImplementation(
			() => ({ add: vi.fn(), on: vi.fn().mockReturnThis(), close: vi.fn() }) as never,
		);
		const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"/**/*.md" watches the filesystem root'));
	});

	test('ignores files reached only through a glob base unless they match the glob', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		Config.additionalWatchPaths = ['**/*.config.ts'];
		vi.spyOn(fileSystem, 'exists').mockImplementation(
			(targetPath) => String(targetPath) === Config.absolutePaths.srcDir,
		);

		let capturedIgnored: ((watchedPath: string, stats?: Stats) => boolean) | undefined;
		vi.spyOn(chokidar, 'watch').mockImplementation((_paths, options) => {
			capturedIgnored = options?.ignored as (watchedPath: string, stats?: Stats) => boolean;
			return { add: vi.fn(), on: vi.fn().mockReturnThis(), close: vi.fn() } as never;
		});

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		const file = { isFile: () => true, isDirectory: () => false } as Stats;
		const directory = { isFile: () => false, isDirectory: () => true } as Stats;
		expect(capturedIgnored?.('/test/project/README.md')).toBe(false);
		expect(capturedIgnored?.('/test/project/README.md', file)).toBe(true);
		expect(capturedIgnored?.('/test/project/docs', directory)).toBe(false);
		expect(capturedIgnored?.('/test/project/.cache', directory)).toBe(true);
		expect(capturedIgnored?.('/test/project/vite.config.ts', file)).toBe(false);
		expect(capturedIgnored?.(path.join(Config.absolutePaths.srcDir, 'components', 'Button.tsx'), file)).toBe(true);
	});

	test('ignores node_modules, .git, workDir, and distDir via a path predicate (chokidar v4+ has no glob support)', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		vi.spyOn(fileSystem, 'exists').mockImplementation(
			(targetPath) => String(targetPath) === Config.absolutePaths.srcDir,
		);

		let capturedIgnored: ((watchedPath: string) => boolean) | undefined;
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn().mockReturnThis(),
			close: vi.fn(),
		};
		vi.spyOn(chokidar, 'watch').mockImplementation((_paths, options) => {
			capturedIgnored = options?.ignored as (watchedPath: string) => boolean;
			return watcherHandle as never;
		});

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		expect(capturedIgnored?.(path.join(Config.absolutePaths.srcDir, 'node_modules', 'react', 'index.js'))).toBe(
			true,
		);
		expect(capturedIgnored?.(path.join(Config.absolutePaths.srcDir, 'components', 'Button.tsx'))).toBe(false);
	});

	test('should attach chokidar handlers only once when watcher subscription is requested twice', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		const HmrManager = createMockHmrManager();
		const Bridge = createMockBridge();
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn().mockReturnThis(),
			close: vi.fn(),
		};

		vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherHandle as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();
		await watcher.createWatcherSubscription();

		expect(chokidar.watch).toHaveBeenCalledTimes(1);
		expect(watcherHandle.on).toHaveBeenCalledTimes(6);
	});

	test('should refresh routes once for added page files', async () => {
		const Config = await createMockConfig();
		installDevRuntimeState(Config);
		const HmrManager = createMockHmrManager();
		const Bridge = createMockBridge();
		const eventHandlers = new Map<string, (path: string) => void>();
		const refreshRouterRoutesCallback = vi.fn(async () => {});
		const watcherHandle = {
			add: vi.fn(),
			on: vi.fn((event: string, handler: (path: string) => void) => {
				eventHandlers.set(event, handler);
				return watcherHandle;
			}),
			close: vi.fn(),
		};

		vi.spyOn(chokidar, 'watch').mockImplementation(() => watcherHandle as never);

		const watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
			changeDebounceMs: 0,
		});

		await watcher.createWatcherSubscription();

		eventHandlers.get('add')?.(path.join(Config.absolutePaths.pagesDir, 'new-page.tsx'));
		await (watcher as any).changeQueue;

		expect(refreshRouterRoutesCallback).toHaveBeenCalledTimes(1);
	});
});
