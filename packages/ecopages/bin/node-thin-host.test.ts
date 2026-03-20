import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeStartOptions, readRuntimeManifest, startThinHostRuntime } from './node-thin-host.js';

const originalManifestPath = process.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH;

afterEach(() => {
	if (originalManifestPath === undefined) {
		delete process.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH;
	} else {
		process.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH = originalManifestPath;
	}
});

describe('node-thin-host', () => {
	it('reads, validates, and returns the runtime manifest from the file handoff', () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-node-thin-host-'));
		const manifestFilePath = path.join(tempDir, 'node-runtime-manifest.json');

		try {
			fs.writeFileSync(
				manifestFilePath,
				JSON.stringify({
					runtime: 'node',
					appRootDir: '/repo',
					sourceRootDir: '/repo/src',
					distDir: '/repo/.eco',
					modulePaths: {
						config: '/repo/eco.config.ts',
						entry: '/repo/app.ts',
					},
					buildPlugins: {
						loaderPluginNames: ['loader-plugin'],
						runtimePluginNames: [],
						browserBundlePluginNames: [],
					},
					serverTranspile: {
						target: 'node',
						format: 'esm',
						sourcemap: 'none',
						splitting: false,
						minify: false,
						externalPackages: true,
					},
					browserBundles: {
						outputDir: '/repo/.eco/assets',
						publicBaseUrl: '/assets',
						vendorBaseUrl: '/assets/vendors',
					},
					bootstrap: {
						devGraphStrategy: 'noop',
						runtimeSpecifierRegistry: 'in-memory',
					},
				}),
				'utf8',
			);

			process.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH = manifestFilePath;

			expect(readRuntimeManifest()).toMatchObject({
				modulePaths: {
					entry: '/repo/app.ts',
				},
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('creates the adapter handoff from validated manifest plus process launch context', () => {
		const manifest = {
			runtime: 'node',
			appRootDir: '/repo',
			sourceRootDir: '/repo/src',
			distDir: '/repo/.eco',
			modulePaths: {
				config: '/repo/eco.config.ts',
				entry: '/repo/app.ts',
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: '/repo/.eco/assets',
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		};

		expect(
			createRuntimeStartOptions({
				manifest,
				workingDirectory: '/repo',
				cliArgs: ['app.ts', '--dev'],
			}),
		).toEqual({
			manifest,
			workingDirectory: '/repo',
			cliArgs: ['app.ts', '--dev'],
		});
	});

	it('delegates startup to the adapter boundary and returns the loaded runtime session', async () => {
		const session = {
			loadApp: vi.fn(async () => ({
				manifest: { runtime: 'node' },
				workingDirectory: '/repo',
				appConfig: { rootDir: '/repo' },
				entryModulePath: '/repo/app.ts',
				entryModule: { default: true },
			})),
			dispose: vi.fn(async () => undefined),
		};
		const adapter = {
			start: vi.fn(async () => session),
		};
		const manifest = {
			runtime: 'node',
			appRootDir: '/repo',
			sourceRootDir: '/repo/src',
			distDir: '/repo/.eco',
			modulePaths: {
				config: '/repo/eco.config.ts',
				entry: '/repo/app.ts',
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: '/repo/.eco/assets',
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		};

		const runtime = await startThinHostRuntime({
			adapter,
			manifest,
			workingDirectory: '/repo',
			cliArgs: ['app.ts', '--dev'],
			attachShutdownHandlers: false,
		});

		expect(adapter.start).toHaveBeenCalledWith({
			manifest,
			workingDirectory: '/repo',
			cliArgs: ['app.ts', '--dev'],
		});
		expect(session.loadApp).toHaveBeenCalledTimes(1);
		expect(runtime).toMatchObject({
			loadedAppRuntime: {
				entryModulePath: '/repo/app.ts',
				appConfig: { rootDir: '/repo' },
			},
			session,
		});
	});

	it('disposes the runtime session if app bootstrap fails after adapter startup', async () => {
		const bootstrapError = new Error('bootstrap failed');
		const session = {
			loadApp: vi.fn(async () => {
				throw bootstrapError;
			}),
			dispose: vi.fn(async () => undefined),
		};
		const adapter = {
			start: vi.fn(async () => session),
		};
		const manifest = {
			runtime: 'node',
			appRootDir: '/repo',
			sourceRootDir: '/repo/src',
			distDir: '/repo/.eco',
			modulePaths: {
				config: '/repo/eco.config.ts',
				entry: '/repo/app.ts',
			},
			buildPlugins: {
				loaderPluginNames: [],
				runtimePluginNames: [],
				browserBundlePluginNames: [],
			},
			serverTranspile: {
				target: 'node',
				format: 'esm',
				sourcemap: 'none',
				splitting: false,
				minify: false,
				externalPackages: true,
			},
			browserBundles: {
				outputDir: '/repo/.eco/assets',
				publicBaseUrl: '/assets',
				vendorBaseUrl: '/assets/vendors',
			},
			bootstrap: {
				devGraphStrategy: 'noop',
				runtimeSpecifierRegistry: 'in-memory',
			},
		};

		await expect(
			startThinHostRuntime({
				adapter,
				manifest,
				workingDirectory: '/repo',
				cliArgs: ['app.ts', '--dev'],
				attachShutdownHandlers: false,
			}),
		).rejects.toThrow('bootstrap failed');

		expect(adapter.start).toHaveBeenCalledWith({
			manifest,
			workingDirectory: '/repo',
			cliArgs: ['app.ts', '--dev'],
		});
		expect(session.loadApp).toHaveBeenCalledTimes(1);
		expect(session.dispose).toHaveBeenCalledTimes(1);
	});
});