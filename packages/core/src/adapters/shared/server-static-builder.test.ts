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

	const AppConfig = {
		rootDir: TMP_DIR,
		distDir: 'dist',
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
	});
});
