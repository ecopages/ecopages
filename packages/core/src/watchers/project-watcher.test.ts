import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
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
	let mockConfig: EcoPagesAppConfig;
	let mockHmrManager: IHmrManager;
	let mockBridge: ClientBridge;
	let mockRefreshCallback: ReturnType<typeof mock>;

	beforeEach(async () => {
		mockConfig = await createMockConfig();
		mockHmrManager = createMockHmrManager();
		mockBridge = createMockBridge();
		mockRefreshCallback = mock(() => {});

		watcher = new ProjectWatcher({
			config: mockConfig,
			refreshRouterRoutesCallback: mockRefreshCallback,
			hmrManager: mockHmrManager,
			bridge: mockBridge,
		});
	});

	afterEach(() => {
		mock.restore();
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
			const pagePath = path.join(mockConfig.absolutePaths.pagesDir, 'index.tsx');
			watcher.triggerRouterRefresh(pagePath);

			expect(mockRefreshCallback).toHaveBeenCalled();
		});

		test('should not call refresh callback for non-page directory changes', () => {
			const nonPagePath = '/test/project/src/components/Button.tsx';
			watcher.triggerRouterRefresh(nonPagePath);

			expect(mockRefreshCallback).not.toHaveBeenCalled();
		});
	});

	describe('handleError', () => {
		test('should broadcast error message and log', () => {
			const error = new Error('Test error');
			watcher.handleError(error);

			expect(mockHmrManager.broadcast).toHaveBeenCalledWith({
				type: 'error',
				message: 'Test error',
			});
		});

		test('should handle non-Error objects', () => {
			watcher.handleError('string error');

			expect(mockHmrManager.broadcast).not.toHaveBeenCalled();
		});
	});
});

describe('ProjectWatcher - File Change Handling', () => {
	let watcher: ProjectWatcher;
	let mockConfig: EcoPagesAppConfig;
	let mockHmrManager: IHmrManager;
	let mockBridge: ClientBridge;
	let mockRefreshCallback: ReturnType<typeof mock>;

	beforeEach(async () => {
		mockConfig = await createMockConfig();
		mockHmrManager = createMockHmrManager();
		mockBridge = createMockBridge();
		mockRefreshCallback = mock(() => {});

		watcher = new ProjectWatcher({
			config: mockConfig as EcoPagesAppConfig,
			refreshRouterRoutesCallback: mockRefreshCallback,
			hmrManager: mockHmrManager,
			bridge: mockBridge,
		});
	});

	afterEach(() => {
		mock.restore();
	});

	describe('public directory files', () => {
		test('should handle public file changes with single-file copy', async () => {
			const publicFilePath = path.join(mockConfig.absolutePaths.publicDir, 'favicon.ico');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(mockBridge.reload).toHaveBeenCalled();
			expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should handle public file in subdirectory', async () => {
			const publicFilePath = path.join(mockConfig.absolutePaths.publicDir, 'images', 'logo.png');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(mockBridge.reload).toHaveBeenCalled();
		});

		test('should not call uncacheModules for public files', async () => {
			const publicFilePath = path.join(mockConfig.absolutePaths.publicDir, 'robots.txt');

			await (watcher as any).handleFileChange(publicFilePath);

			expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
		});
	});

	describe('page files', () => {
		test('should refresh router for page file changes', async () => {
			const pageFilePath = path.join(mockConfig.absolutePaths.pagesDir, 'about.tsx');

			await (watcher as any).handleFileChange(pageFilePath);

			expect(mockRefreshCallback).toHaveBeenCalled();
		});

		test('should call HMR manager for page file changes', async () => {
			const pageFilePath = path.join(mockConfig.absolutePaths.pagesDir, 'contact.tsx');

			await (watcher as any).handleFileChange(pageFilePath);

			expect(mockHmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(pageFilePath));
		});
	});

	describe('additionalWatchPaths', () => {
		test('should reload for files matching additionalWatchPaths pattern', async () => {
			mockConfig.additionalWatchPaths = ['**/*.config.ts'];
			const configFilePath = '/test/project/app.config.ts';

			await (watcher as any).handleFileChange(configFilePath);

			expect(mockBridge.reload).toHaveBeenCalled();
			expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should reload for exact path matches', async () => {
			const exactPath = '/test/project/tailwind.config.ts';
			mockConfig.additionalWatchPaths = [exactPath];

			await (watcher as any).handleFileChange(exactPath);

			expect(mockBridge.reload).toHaveBeenCalled();
		});

		test('should not reload for non-matching paths', async () => {
			mockConfig.additionalWatchPaths = ['**/*.config.ts'];
			const nonMatchingPath = '/test/project/src/components/Button.tsx';

			await (watcher as any).handleFileChange(nonMatchingPath);

			expect(mockHmrManager.handleFileChange).toHaveBeenCalled();
		});
	});

	describe('processor-handled files', () => {
		test('should skip HMR for processor-handled extensions', async () => {
			const mockProcessor = {
				getWatchConfig: mock(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
				})),
			};
			mockConfig.processors.set('css', mockProcessor as any);

			const cssFilePath = '/test/project/src/styles/main.css';

			await (watcher as any).handleFileChange(cssFilePath);

			expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
		});

		test('should process files through HMR when not handled by processor', async () => {
			const mockProcessor = {
				getWatchConfig: mock(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css'],
				})),
			};
			mockConfig.processors.set('css', mockProcessor as any);

			const jsFilePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(jsFilePath);

			expect(mockHmrManager.handleFileChange).toHaveBeenCalledWith(path.resolve(jsFilePath));
		});

		test('should handle processor without watchConfig', async () => {
			const mockProcessor = {
				getWatchConfig: mock(() => null),
			};
			mockConfig.processors.set('no-watch', mockProcessor as any);

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(mockHmrManager.handleFileChange).toHaveBeenCalled();
		});
	});

	describe('error handling', () => {
		test('should handle errors during file change processing', async () => {
			mockHmrManager.handleFileChange = mock(async () => {
				throw new Error('HMR error');
			});

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(mockBridge.error).toHaveBeenCalledWith('HMR error');
		});

		test('should continue processing after error', async () => {
			mockHmrManager.handleFileChange = mock(async () => {
				throw new Error('Processing failed');
			});

			const filePath = '/test/project/src/app.js';

			await (watcher as any).handleFileChange(filePath);

			expect(mockBridge.error).toHaveBeenCalledWith('Processing failed');
		});
	});
});

describe('ProjectWatcher - Priority Rules', () => {
	let watcher: ProjectWatcher;
	let mockConfig: EcoPagesAppConfig;
	let mockHmrManager: IHmrManager;
	let mockBridge: ClientBridge;

	beforeEach(async () => {
		mockConfig = await createMockConfig();
		mockHmrManager = createMockHmrManager();
		mockBridge = createMockBridge();

		watcher = new ProjectWatcher({
			config: mockConfig as EcoPagesAppConfig,
			refreshRouterRoutesCallback: mock(() => {}),
			hmrManager: mockHmrManager,
			bridge: mockBridge,
		});
	});

	afterEach(() => {
		mock.restore();
	});

	test('should prioritize public dir over additionalWatchPaths', async () => {
		mockConfig.additionalWatchPaths = ['**/*'];
		const publicFilePath = path.join(mockConfig.absolutePaths.publicDir, 'icon.png');

		await (watcher as any).handleFileChange(publicFilePath);

		expect(mockBridge.reload).toHaveBeenCalledTimes(1);
		expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should prioritize additionalWatchPaths over processors', async () => {
		mockConfig.additionalWatchPaths = ['**/*.config.ts'];
		const mockProcessor = {
			getWatchConfig: mock(() => ({
				paths: ['/test/project'],
				extensions: ['.ts'],
			})),
		};
		mockConfig.processors.set('ts', mockProcessor as any);

		const configFilePath = '/test/project/app.config.ts';

		await (watcher as any).handleFileChange(configFilePath);

		expect(mockBridge.reload).toHaveBeenCalled();
		expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should prioritize processors over HMR strategies', async () => {
		const mockProcessor = {
			getWatchConfig: mock(() => ({
				paths: ['/test/project/src'],
				extensions: ['.mdx'],
			})),
		};
		mockConfig.processors.set('mdx', mockProcessor as any);

		const mdxFilePath = '/test/project/src/content.mdx';

		await (watcher as any).handleFileChange(mdxFilePath);

		expect(mockHmrManager.handleFileChange).not.toHaveBeenCalled();
	});

	test('should use HMR as final fallback', async () => {
		const regularFilePath = '/test/project/src/components/Button.tsx';

		await (watcher as any).handleFileChange(regularFilePath);

		expect(mockHmrManager.handleFileChange).toHaveBeenCalled();
	});
});

describe('ProjectWatcher - Helper Methods', () => {
	let watcher: ProjectWatcher;
	let mockConfig: EcoPagesAppConfig;

	beforeEach(async () => {
		mockConfig = await createMockConfig();
		watcher = new ProjectWatcher({
			config: mockConfig as EcoPagesAppConfig,
			refreshRouterRoutesCallback: mock(() => {}),
			hmrManager: createMockHmrManager(),
			bridge: createMockBridge(),
		});
	});

	describe('isPublicDirFile', () => {
		test('should return true for files in public directory', () => {
			const publicFile = path.join(mockConfig.absolutePaths.publicDir, 'favicon.ico');
			const result = (watcher as any).isPublicDirFile(publicFile);
			expect(result).toBe(true);
		});

		test('should return false for files outside public directory', () => {
			const srcFile = path.join(mockConfig.absolutePaths.srcDir, 'app.tsx');
			const result = (watcher as any).isPublicDirFile(srcFile);
			expect(result).toBe(false);
		});
	});

	describe('matchesAdditionalWatchPaths', () => {
		test('should match wildcard patterns', () => {
			mockConfig.additionalWatchPaths = ['**/*.config.ts'];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.config.ts');
			expect(result).toBe(true);
		});

		test('should match exact paths', () => {
			const exactPath = '/test/project/tailwind.config.ts';
			mockConfig.additionalWatchPaths = [exactPath];
			const result = (watcher as any).matchesAdditionalWatchPaths(exactPath);
			expect(result).toBe(true);
		});

		test('should return false when no patterns match', () => {
			mockConfig.additionalWatchPaths = ['**/*.config.ts'];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should return false when additionalWatchPaths is empty', () => {
			mockConfig.additionalWatchPaths = [];
			const result = (watcher as any).matchesAdditionalWatchPaths('/test/app.tsx');
			expect(result).toBe(false);
		});
	});

	describe('isHandledByProcessor', () => {
		test('should return true when file extension matches processor', () => {
			const mockProcessor = {
				getWatchConfig: mock(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css', '.scss'],
				})),
			};
			mockConfig.processors.set('css', mockProcessor as any);

			const result = (watcher as any).isHandledByProcessor('/test/styles/main.css');
			expect(result).toBe(true);
		});

		test('should return false when no processor handles the extension', () => {
			const mockProcessor = {
				getWatchConfig: mock(() => ({
					paths: ['/test/project/src'],
					extensions: ['.css'],
				})),
			};
			mockConfig.processors.set('css', mockProcessor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should handle processor without watchConfig', () => {
			const mockProcessor = {
				getWatchConfig: mock(() => null),
			};
			mockConfig.processors.set('no-watch', mockProcessor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});

		test('should handle processor with empty extensions array', () => {
			const mockProcessor = {
				getWatchConfig: mock(() => ({
					paths: ['/test/project/src'],
					extensions: [],
				})),
			};
			mockConfig.processors.set('empty', mockProcessor as any);

			const result = (watcher as any).isHandledByProcessor('/test/app.tsx');
			expect(result).toBe(false);
		});
	});
});
