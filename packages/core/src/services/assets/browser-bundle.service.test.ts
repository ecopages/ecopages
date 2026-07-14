import { describe, expect, it, vi } from 'vitest';
import { ViteHostBuildAdapter } from '../../build/build-adapter.ts';
import { installBuildRuntime } from '../../build/build-runtime.ts';
import { createEcoComponentMetaTransform } from '../../plugins/eco-component-meta-plugin.ts';
import { BrowserBundleService } from './browser-bundle.service.ts';

describe('BrowserBundleService', () => {
	it('routes browser-script builds through the route-module profile when BuildRuntime is installed', async () => {
		const routeModuleBuild = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/entry.js' }],
		}));
		const hmrBuild = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/hmr.js' }],
		}));
		const appConfig = {
			runtime: {},
			loaders: new Map(),
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build: routeModuleBuild,
			resolve: () => '',
			getTranspileOptions: () => ({
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			}),
		});
		installBuildRuntime(appConfig);
		const buildRuntime = appConfig.runtime.buildRuntime;
		const originalHmrBuild = buildRuntime
			.getProfile('browser-hmr')
			.build.bind(buildRuntime.getProfile('browser-hmr'));
		buildRuntime.getProfile('browser-hmr').build = hmrBuild;

		const service = new BrowserBundleService(appConfig);
		await service.bundle({
			profile: 'browser-script',
			entrypoints: ['/tmp/entry.ts'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(routeModuleBuild).toHaveBeenCalledTimes(1);
		expect(hmrBuild).not.toHaveBeenCalled();

		buildRuntime.getProfile('browser-hmr').build = originalHmrBuild;
	});

	it('routes hmr-entrypoint rebuilds through the browser-hmr profile', async () => {
		const hmrBuild = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/entry.js' }],
		}));
		const appConfig = {
			runtime: {},
			loaders: new Map(),
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build: vi.fn(),
			resolve: () => '',
			getTranspileOptions: () => ({
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			}),
		});
		installBuildRuntime(appConfig);
		buildRuntimeProfileSpy(appConfig, 'browser-hmr', hmrBuild);

		const service = new BrowserBundleService(appConfig);
		await service.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: ['/tmp/layout.tsx'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(hmrBuild).toHaveBeenCalledWith(
			expect.objectContaining({
				entrypoints: ['/tmp/layout.tsx'],
				target: 'browser',
				format: 'esm',
			}),
		);
	});

	it('forwards app-owned source transforms to browser bundle builds', async () => {
		const build = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/entry.js' }],
		}));
		const metaTransform = createEcoComponentMetaTransform({
			config: {
				integrations: [{ name: 'react', extensions: ['.tsx'] }],
			} as any,
		});
		const appConfig = {
			runtime: {},
			loaders: new Map(),
			sourceTransforms: new Map([[metaTransform.name, metaTransform]]),
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build,
			resolve: () => '',
			getTranspileOptions: () => ({
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			}),
		});
		installBuildRuntime(appConfig);
		buildRuntimeProfileSpy(appConfig, 'browser-hmr', build);

		const service = new BrowserBundleService(appConfig);
		await service.bundle({
			profile: 'hmr-entrypoint',
			entrypoints: ['/tmp/layout.tsx'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceTransforms: [metaTransform],
			}),
		);
	});

	it('passes grouped entry names to the build executor as named entrypoints', async () => {
		const build = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/page-entry.js' }],
		}));
		const appConfig = {
			runtime: {},
			loaders: new Map(),
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build,
			resolve: () => '',
			getTranspileOptions: () => ({
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			}),
		});
		installBuildRuntime(appConfig);
		buildRuntimeProfileSpy(appConfig, 'route-module', build);

		const service = new BrowserBundleService(appConfig);
		await service.bundleGroupedEntries(
			[
				{ entryName: 'page-entry', entrypoint: '/tmp/.eco/content-script-entries/abc123.js' },
				{ entryName: 'module-images', entrypoint: '/tmp/.eco/content-script-entries/def456.js' },
			],
			{
				profile: 'browser-script',
				outdir: '/tmp/out',
				minify: false,
				naming: '[name]-[hash].[ext]',
			},
		);

		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({
				entrypoints: {
					'page-entry': '/tmp/.eco/content-script-entries/abc123.js',
					'module-images': '/tmp/.eco/content-script-entries/def456.js',
				},
			}),
		);
	});

	it('fails fast when a Vite-hosted app tries to use the Bun browser bundle seam', async () => {
		const appConfig = {
			runtime: {},
			loaders: new Map(),
		} as any;

		setAppBuildAdapterForTest(appConfig, new ViteHostBuildAdapter());
		installBuildRuntime(appConfig);

		const service = new BrowserBundleService(appConfig);

		await expect(
			service.bundle({
				profile: 'browser-script',
				entrypoints: ['/tmp/entry.ts'],
				outdir: '/tmp/out',
				minify: false,
				naming: '[name].js',
			}),
		).rejects.toThrow(/Vite-hosted builds are owned by the host runtime/);
	});
});

function setAppBuildAdapterForTest(appConfig: any, adapter: any): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildAdapter: adapter,
	};
}

function buildRuntimeProfileSpy(
	appConfig: any,
	profile: 'browser-hmr' | 'route-module',
	build: ReturnType<typeof vi.fn>,
) {
	const executor = appConfig.runtime.buildRuntime.getProfile(profile);
	executor.build = build;
}
