import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { ServerStaticBuilder, type ServeOptions } from './server-static-builder';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';
import type { FSRouter } from '../../router/fs-router';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer';
import { appLogger } from '../../global/app-logger.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StaticContentServer } from '../../dev/sc-server';

const TMP_DIR = path.join(os.tmpdir(), 'server-static-builder-test');

vi.mock('../../dev/sc-server', () => ({
	StaticContentServer: {
		createServer: vi.fn(() => ({
			server: { port: 3000 },
		})),
	},
}));

function createMockDependencies() {
	const StaticSiteGenerator = {
		run: vi.fn(() => Promise.resolve()),
	} as unknown as StaticSiteGenerator;

	const mockIntegration = {
		setup: vi.fn(async () => {}),
	} as any;

	const mockProcessor = {
		setup: vi.fn(async () => {
			fs.mkdirSync(path.join(TMP_DIR, 'dist', 'images'), { recursive: true });
			fs.writeFileSync(path.join(TMP_DIR, 'dist', 'images', 'processor.webp'), 'processor-output');
		}),
	} as any;

	const AppConfig = {
		rootDir: TMP_DIR,
		srcDir: 'src',
		publicDir: 'public',
		distDir: 'dist',
		integrations: [mockIntegration],
		processors: new Map([['image-processor', mockProcessor]]),
		absolutePaths: {
			distDir: path.join(TMP_DIR, 'dist'),
			workDir: path.join(TMP_DIR, '.eco'),
		} as EcoPagesAppConfig['absolutePaths'],
	} as unknown as EcoPagesAppConfig;

	const ServeOptions: ServeOptions = {
		hostname: 'localhost',
		port: 3000,
	};

	const Router = {} as FSRouter;
	const RouteRendererFactory = {} as RouteRendererFactory;

	return {
		StaticSiteGenerator,
		AppConfig,
		mockIntegration,
		mockProcessor,
		ServeOptions,
		Router,
		RouteRendererFactory,
		ApiHandlers: [],
	};
}

describe('ServerStaticBuilder', () => {
	beforeAll(() => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('should warn when API handlers are registered for static build modes', async () => {
		const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory } = createMockDependencies();
		const warnSpy = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);

		const builder = new ServerStaticBuilder({
			appConfig: AppConfig,
			staticSiteGenerator: StaticSiteGenerator,
			serveOptions: ServeOptions,
			apiHandlers: [
				{ method: 'GET', path: '/api/auth/*', handler: vi.fn() } as any,
				{ method: 'POST', path: '/api/auth/*', handler: vi.fn() } as any,
			],
		});

		await builder.build(undefined, {
			router: Router,
			routeRendererFactory: RouteRendererFactory,
		});

		expect(warnSpy).toHaveBeenCalledWith(
			'Registered API endpoints are not available in static build or preview modes because no server runtime is started. They are excluded from the generated output.\n',
			'➤ GET /api/auth/*, POST /api/auth/*',
		);
	});

	describe('constructor', () => {
		it('should create instance with provided options', () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions } = createMockDependencies();
			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});
			expect(builder).toBeDefined();
		});
	});

	describe('build', () => {
		it('should run static site generator with correct options', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(StaticSiteGenerator.run).toHaveBeenCalledWith({
				router: Router,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: RouteRendererFactory,
			});
		});

		it('should handle custom serve options for base URL', async () => {
			const { AppConfig, StaticSiteGenerator, Router, RouteRendererFactory } = createMockDependencies();

			const customServeOptions: ServeOptions = {
				hostname: '0.0.0.0',
				port: 8080,
			};

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: customServeOptions,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(StaticSiteGenerator.run).toHaveBeenCalledWith(
				expect.objectContaining({
					baseUrl: 'http://0.0.0.0:8080',
				}),
			);
		});

		it('should start preview server when preview option is true', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});

			await builder.build(
				{ preview: true },
				{
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				},
			);

			expect(StaticContentServer.createServer).toHaveBeenCalledWith({
				appConfig: AppConfig,
				options: { port: 3000 },
			});
		});

		it('should rebuild integration runtime assets after resetting the export directory', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, mockIntegration } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(mockIntegration.setup).toHaveBeenCalledTimes(1);
		});

		it('should rebuild processor-owned assets after resetting the export directory', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, mockProcessor } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(mockProcessor.setup).toHaveBeenCalledTimes(1);
			expect(fs.readFileSync(path.join(TMP_DIR, 'dist', 'images', 'processor.webp'), 'utf8')).toBe(
				'processor-output',
			);
		});

		it('should reset stale export contents before regenerating the public output', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory } =
				createMockDependencies();

			const publicDir = path.join(TMP_DIR, 'src', 'public');
			const distDir = AppConfig.absolutePaths.distDir;
			fs.mkdirSync(publicDir, { recursive: true });
			fs.mkdirSync(path.join(distDir, '.server-modules-meta'), { recursive: true });
			fs.writeFileSync(path.join(publicDir, 'site.css'), 'body { color: red; }');
			fs.writeFileSync(path.join(distDir, '.server-modules-meta', 'stale.js'), 'stale');

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(fs.existsSync(path.join(distDir, '.server-modules-meta'))).toBe(false);
			expect(fs.readFileSync(path.join(distDir, 'site.css'), 'utf8')).toBe('body { color: red; }');
		});
	});
});
