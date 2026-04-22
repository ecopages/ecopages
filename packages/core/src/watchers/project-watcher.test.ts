import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import chokidar from 'chokidar';
import { fileSystem } from '@ecopages/file-system';
import { ProjectWatcher } from './project-watcher';
import type { EcoPagesAppConfig, IHmrManager } from '../types/internal-types.ts';
import type { ClientBridge } from '../adapters/bun/client-bridge.ts';
import { ConfigBuilder } from '../config/config-builder.ts';
import { InMemoryDevGraphService, setAppDevGraphService } from '../services/runtime-state/dev-graph.service.ts';
import { createMockHmrManager, createMockBridge } from './project-watcher.test-helpers.ts';

const createMockConfig = async (rootDir = '/test/project'): Promise<EcoPagesAppConfig> => {
	return await new ConfigBuilder().setRootDir(rootDir).build();
};

describe('ProjectWatcher', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;
	let HmrManager: IHmrManager;
	let Bridge: ClientBridge;
	let RefreshCallback: any;

	beforeEach(async () => {
		Config = await createMockConfig();
		setAppDevGraphService(Config, new InMemoryDevGraphService());
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(async () => {});

		watcher = new ProjectWatcher({
			config: Config,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
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
		setAppDevGraphService(Config, new InMemoryDevGraphService());
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(async () => {});

		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: RefreshCallback,
			hmrManager: HmrManager,
			bridge: Bridge,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should only invalidate server modules for route and server source changes', async () => {
		const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'about.tsx');
		const cssFilePath = path.join(Config.absolutePaths.srcDir, 'styles', 'main.css');
		const serverInvalidationState = Config.runtime?.serverInvalidationState as InMemoryDevGraphService;

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

		test('should call HMR manager for page file changes', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');

			await (watcher as any).handleFileChange(pageFilePath);

			expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(pageFilePath));
		});

		test('should await route refresh before delegating page file changes to HMR', async () => {
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
			});

			const pendingChange = (watcher as any).handleFileChange(pageFilePath, 'add');
			await Promise.resolve();

			expect(asyncRefreshCallback).toHaveBeenCalledTimes(1);
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();

			releaseRefresh();
			await pendingChange;

			expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(pageFilePath));
		});

		test('should not refresh router for stylesheet changes inside the pages directory', async () => {
			const pageCssPath = path.join(Config.absolutePaths.pagesDir, 'index.css');

			await (watcher as any).handleFileChange(pageCssPath);

			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should ignore duplicate save events for the same page within the debounce window', async () => {
			const pageFilePath = path.join(Config.absolutePaths.pagesDir, 'contact.tsx');
			const nowSpy = vi.spyOn(Date, 'now');
			nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1050);

			await (watcher as any).handleFileChange(pageFilePath);
			await (watcher as any).handleFileChange(pageFilePath);

			expect(HmrManager.handleFileChange).toHaveBeenCalledTimes(1);
			expect(RefreshCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe('include files', () => {
		test('should reload for include template changes', async () => {
			const includeFilePath = path.join(Config.absolutePaths.includesDir, 'seo.kita.tsx');

			await (watcher as any).handleFileChange(includeFilePath);

			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
			expect(RefreshCallback).not.toHaveBeenCalled();
		});

		test('should notify processors before reloading include template changes', async () => {
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

			expect(onChange).toHaveBeenCalledWith({ path: path.resolve(includeFilePath), bridge: Bridge });
			expect(Bridge.reload).toHaveBeenCalledTimes(1);
			expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
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

			expect(HmrManager.handleFileChange).toHaveBeenCalled();
		});
	});

	describe('processor-handled files', () => {
		test('should skip HMR for processor-handled extensions', async () => {
			const onChange = vi.fn(async () => {});
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
					onChange,
				})),
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

			expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(jsFilePath));
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
			expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(tsxFilePath));
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
			expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(tsxFilePath));
			expect(HmrManager.broadcast).not.toHaveBeenCalledWith({ type: 'layout-update' });
		});

		test('should handle processor without watchConfig', async () => {
			const Processor = {
				getWatchConfig: vi.fn(() => null),
			};
			Config.processors.set('no-watch', Processor as any);

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(HmrManager.handleFileChange).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		test('should handle errors during file change processing', async () => {
			HmrManager.handleFileChange = vi.fn(async () => {
				throw new Error('HMR error');
			});

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(Bridge.error).toHaveBeenCalledWith('HMR error');
		});

		test('should continue processing after error', async () => {
			HmrManager.handleFileChange = vi.fn(async () => {
				throw new Error('Processing failed');
			});

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(Bridge.error).toHaveBeenCalledWith('Processing failed');
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
		setAppDevGraphService(Config, new InMemoryDevGraphService());
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();

		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: HmrManager,
			bridge: Bridge,
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
		Config.additionalWatchPaths = ['**/*.config.ts'];
		const Processor = {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project'],
				extensions: ['.ts'],
			})),
		};
		Config.processors.set('ts', Processor as any);

		const configFilePath = '/test/project/app.config.ts';

		await (watcher as any).handleFileChange(configFilePath);

		expect(Bridge.reload).toHaveBeenCalled();
		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should prioritize processors over HMR strategies', async () => {
		const Processor = {
			getWatchConfig: vi.fn(() => ({
				paths: ['/test/project/src'],
				extensions: ['.mdx'],
			})),
		};
		Config.processors.set('mdx', Processor as any);

		const mdxFilePath = '/test/project/src/content.mdx';

		await (watcher as any).handleFileChange(mdxFilePath);

		expect(HmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should use HMR as final fallback', async () => {
		const regularFilePath = '/test/project/src/components/Button.tsx';

		await (watcher as any).handleFileChange(regularFilePath);

		expect(HmrManager.handleFileChange).toHaveBeenCalled();
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
		expect(HmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(tsxFilePath));
	});
});

describe('ProjectWatcher - Helper Methods', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;

	beforeEach(async () => {
		Config = await createMockConfig();
		setAppDevGraphService(Config, new InMemoryDevGraphService());
		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: vi.fn(async () => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
		});
	});

	describe('isPublicDirFile', () => {
		test('should return true for files in public directory', () => {
			const publicFile = path.join(Config.absolutePaths.publicDir, 'favicon.ico');
			const result = (watcher as any).isPublicDirFile(publicFile);
			expect(result).toBe(true);
		});

		test('should return false for files outside public directory', () => {
			const srcFile = path.join(Config.absolutePaths.srcDir, 'app.tsx');
			const result = (watcher as any).isPublicDirFile(srcFile);
			expect(result).toBe(false);
		});
	});

	describe('matchesAdditionalWatchPaths', () => {
		test('should match wildcard patterns', () => {
			Config.additionalWatchPaths = ['**/*.config.ts'];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.config.ts');
			expect(result).toBe(true);
		});

		test('should match exact paths', () => {
			const exactPath = '/test/project/tailwind.config.ts';
			Config.additionalWatchPaths = [exactPath];
			const result = (watcher as any).matchesAdditionalWatchPaths(exactPath);
			expect(result).toBe(true);
		});

		test('should return false when no patterns match', () => {
			Config.additionalWatchPaths = ['**/*.config.ts'];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should return false when additionalWatchPaths is empty', () => {
			Config.additionalWatchPaths = [];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.tsx');
			expect(result).toBe(false);
		});
	});

	describe('isIncludeSourceFile', () => {
		test('should return true for files in includes directory', () => {
			const includeFile = path.join(Config.absolutePaths.includesDir, 'seo.kita.tsx');
			const result = (watcher as any).isIncludeSourceFile(includeFile);
			expect(result).toBe(true);
		});

		test('should return false for files outside includes directory', () => {
			const srcFile = path.join(Config.absolutePaths.srcDir, 'components', 'Button.tsx');
			const result = (watcher as any).isIncludeSourceFile(srcFile);
			expect(result).toBe(false);
		});
	});

	describe('isHandledByProcessor', () => {
		test('should return true when file extension matches processor', () => {
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
				})),
			};
			Config.processors.set('css', Processor as any);

			const result = (watcher as any).isHandledByProcessor('/test/styles/main.css');
			expect(result).toBe(true);
		});

		test('should return false when no processor handles the extension', () => {
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css'],
				})),
			};
			Config.processors.set('css', Processor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should handle processor without watchConfig', () => {
			const Processor = {
				getWatchConfig: vi.fn(() => null),
			};
			Config.processors.set('no-watch', Processor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should handle processor with empty extensions array', () => {
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: [],
				})),
			};
			Config.processors.set('empty', Processor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});
	});
});

describe('ProjectWatcher - Watch Subscriptions', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('should watch includes and src directories alongside pages and processor paths', async () => {
		const Config = await createMockConfig();
		setAppDevGraphService(Config, new InMemoryDevGraphService());
		const HmrManager = createMockHmrManager();
		const Bridge = createMockBridge();
		vi.spyOn(fileSystem, 'exists').mockImplementation((targetPath) =>
			[Config.absolutePaths.includesDir, Config.absolutePaths.srcDir, Config.absolutePaths.pagesDir].includes(
				String(targetPath),
			),
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
			hmrManager: HmrManager,
			bridge: Bridge,
		});

		await watcher.createWatcherSubscription();

		expect(chokidarWatch).toHaveBeenCalledWith(
			expect.arrayContaining([
				'/test/project/custom-watch',
				Config.absolutePaths.includesDir,
				Config.absolutePaths.srcDir,
				Config.absolutePaths.pagesDir,
			]),
			expect.any(Object),
		);
		expect(watcherHandle.add).not.toHaveBeenCalled();
	});

	test('should attach chokidar handlers only once when watcher subscription is requested twice', async () => {
		const Config = await createMockConfig();
		setAppDevGraphService(Config, new InMemoryDevGraphService());
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
		});

		await watcher.createWatcherSubscription();
		await watcher.createWatcherSubscription();

		expect(chokidar.watch).toHaveBeenCalledTimes(1);
		expect(watcherHandle.on).toHaveBeenCalledTimes(6);
	});

	test('should refresh routes once for added page files', async () => {
		const Config = await createMockConfig();
		setAppDevGraphService(Config, new InMemoryDevGraphService());
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
		});

		await watcher.createWatcherSubscription();

		eventHandlers.get('add')?.(path.join(Config.absolutePaths.pagesDir, 'new-page.tsx'));
		await (watcher as any).changeQueue;

		expect(refreshRouterRoutesCallback).toHaveBeenCalledTimes(1);
	});
});
