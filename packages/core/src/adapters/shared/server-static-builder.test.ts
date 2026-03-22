import assert from 'node:assert/strict';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
	ServerStaticBuilder,
	type ServeOptions,
	type ServerStaticBuilderLogger,
	type ServerStaticPreviewServerFactory,
} from './server-static-builder';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';
import type { FSRouter } from '../../router/server/fs-router';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'server-static-builder-test');

function createMockDependencies() {
	const calls = {
		staticSiteGeneratorRun: [] as Array<unknown>,
		integrationSetup: 0,
		processorSetup: 0,
		warn: [] as Array<[string, string | undefined]>,
		info: [] as string[],
		error: [] as string[],
		createServer: [] as Array<{
			appConfig: EcoPagesAppConfig;
			options: { port: number };
		}>,
	};

	const StaticSiteGenerator = {
		run: async (options: unknown) => {
			calls.staticSiteGeneratorRun.push(options);
		},
	} as unknown as StaticSiteGenerator;

	const mockIntegration = {
		setup: async () => {
			calls.integrationSetup += 1;
		},
	} as any;

	const mockProcessor = {
		setup: async () => {
			calls.processorSetup += 1;
			fs.mkdirSync(path.join(TMP_DIR, 'dist', 'images'), { recursive: true });
			fs.writeFileSync(path.join(TMP_DIR, 'dist', 'images', 'processor.webp'), 'processor-output');
		},
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
	const logger: ServerStaticBuilderLogger = {
		warn: (message: string, detail?: string) => {
			calls.warn.push([message, detail]);
		},
		info: (message: string) => {
			calls.info.push(message);
		},
		error: (message: string) => {
			calls.error.push(message);
		},
	};
	const previewServerFactory: ServerStaticPreviewServerFactory = {
		createServer: ({ appConfig, options }) => {
			calls.createServer.push({ appConfig, options });
			return {
				server: { port: 3000 },
			};
		},
	};

	return {
		calls,
		StaticSiteGenerator,
		AppConfig,
		mockIntegration,
		mockProcessor,
		logger,
		previewServerFactory,
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
	});

	it('should warn when API handlers are registered for static build modes', async () => {
		const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
			createMockDependencies();

		const builder = new ServerStaticBuilder({
			appConfig: AppConfig,
			staticSiteGenerator: StaticSiteGenerator,
			serveOptions: ServeOptions,
			logger,
			apiHandlers: [
				{ method: 'GET', path: '/api/auth/*', handler: () => undefined } as any,
				{ method: 'POST', path: '/api/auth/*', handler: () => undefined } as any,
			],
		});

		await builder.build(undefined, {
			router: Router,
			routeRendererFactory: RouteRendererFactory,
		});

		assert.deepEqual(calls.warn, [
			[
				'Registered API endpoints are not available in static build or preview modes because no server runtime is started. They are excluded from the generated output.\n',
				'➤ GET /api/auth/*, POST /api/auth/*',
			],
		]);
	});

	describe('constructor', () => {
		it('should create instance with provided options', () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, logger, previewServerFactory } =
				createMockDependencies();
			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				logger,
				previewServerFactory,
			});
			expect(builder).toBeDefined();
		});
	});

	describe('build', () => {
		it('should run static site generator with correct options', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			assert.deepEqual(calls.staticSiteGeneratorRun, [
				{
					router: Router,
					baseUrl: 'http://localhost:3000',
					routeRendererFactory: RouteRendererFactory,
					staticRoutes: undefined,
				},
			]);
		});

		it('should handle custom serve options for base URL', async () => {
			const { AppConfig, StaticSiteGenerator, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const customServeOptions: ServeOptions = {
				hostname: '0.0.0.0',
				port: 8080,
			};

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: customServeOptions,
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			assert.equal((calls.staticSiteGeneratorRun[0] as { baseUrl: string }).baseUrl, 'http://0.0.0.0:8080');
		});

		it('should start preview server when preview option is true', async () => {
			const {
				AppConfig,
				StaticSiteGenerator,
				ServeOptions,
				Router,
				RouteRendererFactory,
				logger,
				previewServerFactory,
				calls,
			} = createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				logger,
				previewServerFactory,
			});

			await builder.build(
				{ preview: true },
				{
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				},
			);

			assert.deepEqual(calls.createServer, [
				{
					appConfig: AppConfig,
					options: { port: 3000 },
				},
			]);
		});

		it('should rebuild integration runtime assets after resetting the export directory', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			assert.equal(calls.integrationSetup, 1);
		});

		it('should rebuild processor-owned assets after resetting the export directory', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			assert.equal(calls.processorSetup, 1);
			assert.equal(
				fs.readFileSync(path.join(TMP_DIR, 'dist', 'images', 'processor.webp'), 'utf8'),
				'processor-output',
			);
		});

		it('should reset stale export contents before regenerating the public output', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
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
				logger,
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
