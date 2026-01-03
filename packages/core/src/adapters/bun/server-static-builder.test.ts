import { describe, expect, it, mock, beforeAll, afterAll } from 'bun:test';
import { ServerStaticBuilder } from '../shared/server-static-builder';
import type { EcoPagesAppConfig } from '../../internal-types';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';
import type { BunServeAdapterServerOptions } from './server-adapter';
import type { FSRouter } from '../../router/fs-router';
import type { RouteRendererFactory } from '../../route-renderer/route-renderer';
import type { ServeOptions } from '../shared/server-static-builder';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'server-static-builder-test');

function createMockDependencies() {
	const mockStaticSiteGenerator = {
		run: mock(() => Promise.resolve()),
	} as unknown as StaticSiteGenerator;

	const mockAppConfig = {
		rootDir: TMP_DIR,
		distDir: 'dist',
	} as unknown as EcoPagesAppConfig;

	const mockServeOptions = {
		hostname: 'localhost',
		port: 3000,
	} as unknown as BunServeAdapterServerOptions;

	const mockRouter = {} as FSRouter;
	const mockRouteRendererFactory = {} as RouteRendererFactory;

	return {
		mockStaticSiteGenerator,
		mockAppConfig,
		mockServeOptions,
		mockRouter,
		mockRouteRendererFactory,
	};
}

describe('ServerStaticBuilder', () => {
	beforeAll(() => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	describe('constructor', () => {
		it('should create instance with provided options', () => {
			const { mockAppConfig, mockStaticSiteGenerator, mockServeOptions } = createMockDependencies();
			const builder = new ServerStaticBuilder({
				appConfig: mockAppConfig,
				staticSiteGenerator: mockStaticSiteGenerator,
				serveOptions: mockServeOptions,
			});
			expect(builder).toBeDefined();
		});
	});

	describe('build', () => {
		it('should run static site generator with correct options', async () => {
			const { mockAppConfig, mockStaticSiteGenerator, mockServeOptions, mockRouter, mockRouteRendererFactory } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: mockAppConfig,
				staticSiteGenerator: mockStaticSiteGenerator,
				serveOptions: mockServeOptions,
			});

			await builder.build(undefined, {
				router: mockRouter,
				routeRendererFactory: mockRouteRendererFactory,
			});

			expect(mockStaticSiteGenerator.run).toHaveBeenCalledWith({
				router: mockRouter,
				baseUrl: 'http://localhost:3000',
				routeRendererFactory: mockRouteRendererFactory,
			});
		});

		it('should handle custom serve options for base URL', async () => {
			const { mockAppConfig, mockStaticSiteGenerator, mockRouter, mockRouteRendererFactory } =
				createMockDependencies();

			const customServeOptions: ServeOptions = {
				hostname: '0.0.0.0',
				port: 8080,
			};

			const builder = new ServerStaticBuilder({
				appConfig: mockAppConfig,
				staticSiteGenerator: mockStaticSiteGenerator,
				serveOptions: customServeOptions,
			});

			await builder.build(undefined, {
				router: mockRouter,
				routeRendererFactory: mockRouteRendererFactory,
			});

			expect(mockStaticSiteGenerator.run).toHaveBeenCalledWith(
				expect.objectContaining({
					baseUrl: 'http://0.0.0.0:8080',
				}),
			);
		});
	});
});
