import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { ServerLifecycle, type ServerLifecycleParams } from './server-lifecycle';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { ClientBridge } from './client-bridge';
import type { HmrManager } from './hmr-manager';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'server-lifecycle-test');
const SRC_DIR = path.join(TMP_DIR, 'src');
const DIST_DIR = path.join(TMP_DIR, 'dist');
const PUBLIC_DIR = 'public';

function createMockData(): ServerLifecycleParams {
	const HmrManager = {
		buildRuntime: vi.fn(() => Promise.resolve()),
		setEnabled: vi.fn(),
		setPlugins: vi.fn(),
	} as unknown as HmrManager;

	const Bridge = {} as ClientBridge;

	const AppConfig = {
		rootDir: TMP_DIR,
		srcDir: 'src',
		distDir: 'dist',
		publicDir: PUBLIC_DIR,
		absolutePaths: {
			distDir: DIST_DIR,
			srcDir: SRC_DIR,
		},
		loaders: new Map(),
		processors: new Map(),
		integrations: [],
	} as unknown as EcoPagesAppConfig;

	return {
		appConfig: AppConfig,
		runtimeOrigin: 'http://localhost:3000',
		hmrManager: HmrManager,
		bridge: Bridge,
	};
}

describe('ServerLifecycle', () => {
	beforeAll(() => {
		fs.mkdirSync(path.join(SRC_DIR, PUBLIC_DIR), { recursive: true });
		fs.writeFileSync(path.join(SRC_DIR, PUBLIC_DIR, 'test.txt'), 'test content');
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	describe('constructor', () => {
		it('should create instance with provided options', () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			expect(lifecycle).toBeDefined();
		});
	});

	describe('initialize', () => {
		it('should return a StaticSiteGenerator instance', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			const ssg = await lifecycle.initialize();
			expect(ssg).toBeDefined();
		});

		it('should call hmrManager.buildRuntime', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			await lifecycle.initialize();
			expect(params.hmrManager.buildRuntime).toHaveBeenCalled();
		});
	});

	describe('setupLoaders', () => {
		it('should not throw when loaders map is empty', () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			expect(() => lifecycle.setupLoaders()).not.toThrow();
		});
	});

	describe('copyPublicDir', () => {
		it('should copy public directory to dist', () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			lifecycle.copyPublicDir();

			const destPath = path.join(DIST_DIR, 'test.txt');
			expect(fs.existsSync(destPath)).toBe(true);
		});
	});

	describe('initializePlugins', () => {
		it('should enable HMR when watch option is true', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			await lifecycle.initializePlugins({ watch: true });
			expect(params.hmrManager.setEnabled).toHaveBeenCalledWith(true);
		});

		it('should disable HMR when watch option is false', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			await lifecycle.initializePlugins({ watch: false });
			expect(params.hmrManager.setEnabled).toHaveBeenCalledWith(false);
		});

		it('should return empty array when no processors have build plugins', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			const plugins = await lifecycle.initializePlugins();
			expect(plugins).toEqual([]);
		});
	});

	describe('getStaticSiteGenerator', () => {
		it('should return the static site generator after initialization', async () => {
			const params = createMockData();
			const lifecycle = new ServerLifecycle(params);
			await lifecycle.initialize();
			const ssg = lifecycle.getStaticSiteGenerator();
			expect(ssg).toBeDefined();
		});
	});
});
