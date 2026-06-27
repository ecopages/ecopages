import assert from 'node:assert/strict';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import * as staticBuildInvalidation from '../../static-site-generator/static-build-invalidation.ts';
import { ServerStaticBuilder, type ServeOptions, type ServerStaticBuilderLogger } from './server-static-builder';
import {
	resolveEntryFile,
	DEFAULT_ENTRY_FILE,
	ENTRY_FILE_ENV,
	SERVER_BUNDLE_DIR,
	SERVER_BUNDLE_FILENAME,
} from '../../utils/resolve-entry-file';
import {
	setAppBuildAdapter,
	setupAppRuntimePlugins,
	type BuildAdapter,
	type BuildOptions,
	type BuildResult,
} from '../../build/build-adapter';
import type { EcoPagesAppConfig } from '../../types/internal-types';
import type { StaticSiteGenerator } from '../../static-site-generator/static-site-generator';
import type { RouteRegistry } from '../../router/server/route-registry';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP_DIR = path.join(os.tmpdir(), 'server-static-builder-test');

function createPrepareRuntimeAssets(
	appConfig: EcoPagesAppConfig,
	runtimeOrigin = 'http://127.0.0.1:3000',
): () => Promise<void> {
	return () =>
		setupAppRuntimePlugins({
			appConfig,
			runtimeOrigin,
		});
}

function createMockDependencies() {
	const calls = {
		staticSiteGeneratorRun: [] as Array<unknown>,
		integrationSetup: 0,
		processorSetup: 0,
		warn: [] as Array<[string, string | undefined]>,
		info: [] as string[],
		error: [] as string[],
	};

	const StaticSiteGenerator = {
		run: async (options: unknown) => {
			calls.staticSiteGeneratorRun.push(options);
		},
	} as unknown as StaticSiteGenerator;

	const mockIntegration = {
		setConfig: () => {},
		setRuntimeOrigin: () => {},
		setHmrManager: () => {},
		plugins: [],
		setup: async () => {
			calls.integrationSetup += 1;
		},
	} as any;

	const mockProcessor = {
		plugins: [],
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
		loaders: new Map(),
		absolutePaths: {
			distDir: path.join(TMP_DIR, 'dist'),
			workDir: path.join(TMP_DIR, '.eco'),
		} as EcoPagesAppConfig['absolutePaths'],
		runtime: {},
	} as unknown as EcoPagesAppConfig;

	const defaultBuildAdapter: BuildAdapter = {
		ownership: 'rolldown',
		async build(): Promise<BuildResult> {
			return { success: true, logs: [], outputs: [] };
		},
		resolve(importPath: string): string {
			return importPath;
		},
		getTranspileOptions() {
			return { target: 'node', format: 'esm', sourcemap: 'hidden' };
		},
	};
	setAppBuildAdapter(AppConfig, defaultBuildAdapter);

	const ServeOptions: ServeOptions = {
		hostname: 'localhost',
		port: 3000,
	};

	const Router = {} as RouteRegistry;
	const RouteRendererFactory = {} as StaticGenerationRendererResolver;
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

	return {
		calls,
		StaticSiteGenerator,
		AppConfig,
		mockIntegration,
		mockProcessor,
		logger,
		ServeOptions,
		Router,
		RouteRendererFactory,
		ApiHandlers: [],
	};
}

describe('resolveEntryFile', () => {
	const emptyEnv: Record<string, string | undefined> = {};

	it('returns the explicit entryFile when provided', () => {
		expect(resolveEntryFile({ entryFile: 'src/server.ts', env: emptyEnv, argv: ['node', '--port', '3000'] })).toBe(
			'src/server.ts',
		);
	});

	it('falls back to ECOPAGES_ENTRY_FILE when no explicit arg', () => {
		expect(
			resolveEntryFile({
				env: { [ENTRY_FILE_ENV]: 'from-env.ts' },
				argv: ['node', '--port', '3000'],
			}),
		).toBe('from-env.ts');
	});

	it('prefers explicit entryFile over env var', () => {
		expect(
			resolveEntryFile({
				entryFile: 'arg-wins.ts',
				env: { [ENTRY_FILE_ENV]: 'env-loses.ts' },
				argv: ['node', '--entry-file', 'flag.ts'],
			}),
		).toBe('arg-wins.ts');
	});

	it('prefers env var over --entry-file flag', () => {
		expect(
			resolveEntryFile({
				env: { [ENTRY_FILE_ENV]: 'env-wins.ts' },
				argv: ['node', '--entry-file', 'flag-loses.ts'],
			}),
		).toBe('env-wins.ts');
	});

	it('reads --entry-file from argv when no arg or env', () => {
		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', '--entry-file', 'flag-wins.ts', '--port', '3000'],
			}),
		).toBe('flag-wins.ts');
	});

	it('supports the -e short alias for --entry-file', () => {
		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', '-e', 'short-alias.ts'],
			}),
		).toBe('short-alias.ts');
	});

	it('tolerates unknown flags without throwing', () => {
		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', '--unknown-flag', 'value', '--entry-file', 'safe.ts'],
			}),
		).toBe('safe.ts');
	});

	it(`returns ${DEFAULT_ENTRY_FILE} default when no source provides a value`, () => {
		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', '--port', '3000', '--hostname', 'localhost'],
			}),
		).toBe(DEFAULT_ENTRY_FILE);
	});

	it('ignores positional args (defined-args-only contract)', () => {
		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', 'src/server.ts', '--port', '3000'],
			}),
		).toBe(DEFAULT_ENTRY_FILE);
	});

	it('treats empty strings as missing (falls through to next source)', () => {
		expect(
			resolveEntryFile({
				entryFile: '',
				env: { [ENTRY_FILE_ENV]: 'env-fallback.ts' },
				argv: ['node', '--entry-file', 'flag-fallback.ts'],
			}),
		).toBe('env-fallback.ts');
	});

	it('precedence order: entryFile arg > env > --entry-file flag > default', () => {
		expect(
			resolveEntryFile({
				entryFile: '1-arg.ts',
				env: { [ENTRY_FILE_ENV]: '2-env.ts' },
				argv: ['node', '--entry-file', '3-flag.ts'],
			}),
		).toBe('1-arg.ts');

		expect(
			resolveEntryFile({
				env: { [ENTRY_FILE_ENV]: '2-env.ts' },
				argv: ['node', '--entry-file', '3-flag.ts'],
			}),
		).toBe('2-env.ts');

		expect(
			resolveEntryFile({
				env: emptyEnv,
				argv: ['node', '--entry-file', '3-flag.ts'],
			}),
		).toBe('3-flag.ts');
	});
});

describe('resolve-entry-file constants', () => {
	it('exposes the canonical default entry file', () => {
		expect(DEFAULT_ENTRY_FILE).toBe('app.ts');
	});

	it('exposes the canonical env var name', () => {
		expect(ENTRY_FILE_ENV).toBe('ECOPAGES_ENTRY_FILE');
	});

	it('exposes the canonical server bundle directory', () => {
		expect(SERVER_BUNDLE_DIR).toBe('.server');
	});

	it('exposes the canonical server bundle filename', () => {
		expect(SERVER_BUNDLE_FILENAME).toBe('app.mjs');
	});
});

describe('ServerStaticBuilder', () => {
	beforeAll(() => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
		fs.writeFileSync(path.join(TMP_DIR, 'app.ts'), 'await Promise.resolve();\n', 'utf8');
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	describe('constructor', () => {
		it('should create instance with provided options', () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, logger } = createMockDependencies();
			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
				logger,
			});
			expect(builder).toBeDefined();
		});
	});

	describe('build', () => {
		it('re-runs refreshRuntimeAssets when dist is reset even if adapter init already prepared runtime assets', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();
			const appConfig = {
				...AppConfig,
				runtime: {
					...AppConfig.runtime,
					runtimeAssetsPrepared: true,
				},
			} as EcoPagesAppConfig;

			const builder = new ServerStaticBuilder({
				appConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(calls.processorSetup).toBe(1);
			expect(calls.integrationSetup).toBe(1);
			expect(appConfig.runtime?.runtimeAssetsPrepared).toBe(true);
		});

		it('skips refreshRuntimeAssets when runtime assets were already prepared and dist is preserved', async () => {
			const shouldResetSpy = vi
				.spyOn(staticBuildInvalidation, 'shouldResetStaticExportDirectory')
				.mockReturnValue(false);

			try {
				const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
					createMockDependencies();
				const appConfig = {
					...AppConfig,
					runtime: {
						...AppConfig.runtime,
						runtimeAssetsPrepared: true,
					},
				} as EcoPagesAppConfig;

				const builder = new ServerStaticBuilder({
					appConfig,
					staticSiteGenerator: StaticSiteGenerator,
					serveOptions: ServeOptions,
					prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
					logger,
				});

				await builder.build(undefined, {
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				});

				expect(calls.processorSetup).toBe(0);
				expect(calls.integrationSetup).toBe(0);
			} finally {
				shouldResetSpy.mockRestore();
			}
		});

		it('should run static site generator with correct options', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
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
					force: false,
					preserveExportDirectory: false,
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
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig, 'http://0.0.0.0:8080'),
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			assert.equal((calls.staticSiteGeneratorRun[0] as { baseUrl: string }).baseUrl, 'http://0.0.0.0:8080');
		});

		it('should allow build-time base URL overrides', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
				logger,
			});

			await builder.build(
				{ baseUrl: 'http://localhost:41731' },
				{
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				},
			);

			assert.equal((calls.staticSiteGeneratorRun[0] as { baseUrl: string }).baseUrl, 'http://localhost:41731');
		});

		it('should rebuild integration runtime assets after resetting the export directory', async () => {
			const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
				createMockDependencies();

			const builder = new ServerStaticBuilder({
				appConfig: AppConfig,
				staticSiteGenerator: StaticSiteGenerator,
				serveOptions: ServeOptions,
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
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
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
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
				prepareRuntimeAssets: createPrepareRuntimeAssets(AppConfig),
				logger,
			});

			await builder.build(undefined, {
				router: Router,
				routeRendererFactory: RouteRendererFactory,
			});

			expect(fs.existsSync(path.join(distDir, '.server-modules-meta'))).toBe(false);
			expect(fs.readFileSync(path.join(distDir, 'site.css'), 'utf8')).toBe('body { color: red; }');
		});

		describe('bundleServerEntry', () => {
			function setupBundleFixture(name: string) {
				const distDir = path.join(TMP_DIR, 'bundle-entry', name);
				fs.mkdirSync(distDir, { recursive: true });
				return distDir;
			}

			it('bundles server entry even when no API endpoints are registered', async () => {
				const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger, calls } =
					createMockDependencies();
				const distDir = setupBundleFixture('no-endpoints');
				fs.writeFileSync(path.join(TMP_DIR, 'app.ts'), 'await Promise.resolve();', 'utf8');
				const appConfig = {
					...AppConfig,
					rootDir: TMP_DIR,
					absolutePaths: { ...AppConfig.absolutePaths, distDir },
				} as EcoPagesAppConfig;

				const builder = new ServerStaticBuilder({
					appConfig,
					staticSiteGenerator: StaticSiteGenerator,
					serveOptions: ServeOptions,
					prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
					logger,
				});

				await builder.build(undefined, {
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				});

				expect(
					calls.info.some(
						(m) => m === 'Bundling server entry file...' || m === 'Reusing cached server entry bundle',
					),
				).toBe(true);
			});

			it('throws when entry file does not exist', async () => {
				const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
					createMockDependencies();
				const distDir = setupBundleFixture('missing-entry');
				const appConfig = {
					...AppConfig,
					absolutePaths: { ...AppConfig.absolutePaths, distDir },
				} as EcoPagesAppConfig;

				const builder = new ServerStaticBuilder({
					appConfig,
					staticSiteGenerator: StaticSiteGenerator,
					serveOptions: ServeOptions,
					prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
					logger,
					entryFile: 'nonexistent.ts',
					apiHandlers: [{ method: 'GET', path: '/api/ping', handler: () => undefined } as any],
				});

				await assert.rejects(
					builder.build(undefined, {
						router: Router,
						routeRendererFactory: RouteRendererFactory,
					}),
					/Cannot bundle server entry: file "nonexistent.ts" not found/,
				);
			});

			it('throws when build ownership is vite-host', async () => {
				const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
					createMockDependencies();
				const distDir = setupBundleFixture('vite-host');
				fs.writeFileSync(path.join(distDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
				const appConfig = {
					...AppConfig,
					runtime: { buildOwnership: 'vite-host' as const },
					absolutePaths: { ...AppConfig.absolutePaths, distDir },
				} as EcoPagesAppConfig;

				const builder = new ServerStaticBuilder({
					appConfig,
					staticSiteGenerator: StaticSiteGenerator,
					serveOptions: ServeOptions,
					prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
					logger,
					apiHandlers: [{ method: 'GET', path: '/api/ping', handler: () => undefined } as any],
				});

				await assert.rejects(
					builder.build(undefined, {
						router: Router,
						routeRendererFactory: RouteRendererFactory,
					}),
					/build ownership is "vite-host"/,
				);
			});

			it('falls back to ECOPAGES_ENTRY_FILE env var when entryFile arg is not provided', async () => {
				const original = process.env[ENTRY_FILE_ENV];
				try {
					const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
						createMockDependencies();
					const distDir = setupBundleFixture('env-entry');
					const rootDir = TMP_DIR;
					fs.writeFileSync(path.join(rootDir, 'server.ts'), 'await Promise.resolve();', 'utf8');
					const appConfig = {
						...AppConfig,
						rootDir,
						absolutePaths: { ...AppConfig.absolutePaths, distDir },
					} as EcoPagesAppConfig;

					process.env[ENTRY_FILE_ENV] = 'server.ts';

					const builder = new ServerStaticBuilder({
						appConfig,
						staticSiteGenerator: StaticSiteGenerator,
						serveOptions: ServeOptions,
						prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
						logger,
						apiHandlers: [{ method: 'GET', path: '/api/ping', handler: () => undefined } as any],
					});

					await builder.build(undefined, {
						router: Router,
						routeRendererFactory: RouteRendererFactory,
					});
				} finally {
					if (original === undefined) {
						delete process.env[ENTRY_FILE_ENV];
					} else {
						process.env[ENTRY_FILE_ENV] = original;
					}
				}
			});

			it('prefers constructor entryFile over ECOPAGES_ENTRY_FILE env var', async () => {
				const original = process.env[ENTRY_FILE_ENV];
				try {
					const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
						createMockDependencies();
					const distDir = setupBundleFixture('precedence-entry');
					const rootDir = TMP_DIR;
					fs.writeFileSync(path.join(rootDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
					const appConfig = {
						...AppConfig,
						rootDir,
						absolutePaths: { ...AppConfig.absolutePaths, distDir },
					} as EcoPagesAppConfig;

					process.env[ENTRY_FILE_ENV] = 'env-wins.ts';

					const builder = new ServerStaticBuilder({
						appConfig,
						staticSiteGenerator: StaticSiteGenerator,
						serveOptions: ServeOptions,
						prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
						logger,
						entryFile: 'app.ts',
						apiHandlers: [{ method: 'GET', path: '/api/ping', handler: () => undefined } as any],
					});

					await builder.build(undefined, {
						router: Router,
						routeRendererFactory: RouteRendererFactory,
					});
				} finally {
					if (original === undefined) {
						delete process.env[ENTRY_FILE_ENV];
					} else {
						process.env[ENTRY_FILE_ENV] = original;
					}
				}
			});

			it('externalizes package imports when bundling the server entry', async () => {
				const { AppConfig, StaticSiteGenerator, ServeOptions, Router, RouteRendererFactory, logger } =
					createMockDependencies();
				const distDir = setupBundleFixture('external-packages');
				const rootDir = TMP_DIR;
				fs.writeFileSync(path.join(rootDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
				const appConfig = {
					...AppConfig,
					rootDir,
					absolutePaths: { ...AppConfig.absolutePaths, distDir },
				} as EcoPagesAppConfig;

				const buildCalls: BuildOptions[] = [];
				const buildAdapter: BuildAdapter = {
					ownership: 'rolldown',
					async build(options: BuildOptions): Promise<BuildResult> {
						buildCalls.push(options);
						return { success: true, logs: [], outputs: [] };
					},
					resolve(importPath: string): string {
						return importPath;
					},
					getTranspileOptions() {
						return { target: 'node', format: 'esm', sourcemap: 'hidden' };
					},
				};
				setAppBuildAdapter(appConfig, buildAdapter);

				const builder = new ServerStaticBuilder({
					appConfig,
					staticSiteGenerator: StaticSiteGenerator,
					serveOptions: ServeOptions,
					prepareRuntimeAssets: createPrepareRuntimeAssets(appConfig),
					logger,
					apiHandlers: [{ method: 'GET', path: '/api/ping', handler: () => undefined } as any],
				});

				await builder.build(undefined, {
					router: Router,
					routeRendererFactory: RouteRendererFactory,
				});

				assert.equal(buildCalls.length, 1);
				assert.equal(buildCalls[0]?.externalPackages, true);
			});
		});
	});
});
