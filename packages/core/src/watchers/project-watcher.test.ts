import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { ProjectWatcher } from './project-watcher';
import type { EcoPagesAppConfig, IHmrManager } from '../internal-types';
import type { ClientBridge } from '../adapters/bun/client-bridge';
import { ConfigBuilder } from '../config/config-builder';
import { createMockHmrManager, createMockBridge } from './project-watcher.test-helpers';

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
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(() => {});

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
		test('should call refresh callback for page directory changes', () => {
			const pagePath = path.join(Config.absolutePaths.pagesDir, 'index.tsx');
			watcher.triggerRouterRefresh(pagePath);

			expect(RefreshCallback).toHaveBeenCalled();
		});

		test('should not call refresh callback for non-page directory changes', () => {
			const nonPagePath = '/test/project/src/components/Button.tsx';
			watcher.triggerRouterRefresh(nonPagePath);

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
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();
		RefreshCallback = vi.fn(() => {});

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
			const Processor = {
				getWatchConfig: vi.fn(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
				})),
			};
			Config.processors.set('css', Processor as any);

			const cssFilePath = '/test/project/src/styles/main.css';

			await (watcher as any).handleFileChange(cssFilePath);

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
		HmrManager = createMockHmrManager();
		Bridge = createMockBridge();

		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: vi.fn(() => {}),
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
});

describe('ProjectWatcher - Helper Methods', () => {
	let watcher: ProjectWatcher;
	let Config: EcoPagesAppConfig;

	beforeEach(async () => {
		Config = await createMockConfig();
		watcher = new ProjectWatcher({
			config: Config as EcoPagesAppConfig,
			refreshRouterRoutesCallback: vi.fn(() => {}),
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
