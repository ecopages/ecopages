import { describe, expect, it, vi } from 'vitest';
import { installBuildQueue } from '../../build/runtime/build-queue.ts';
import { isHashedBrowserAsset } from './hashed-browser-asset.ts';
import { BrowserBundleService } from './browser-bundle.service.ts';
import { createBuildSuccess } from '../../__fixtures__/build/build-result.ts';

describe('BrowserBundleService', () => {
	it('queues browser-script builds on the build lane', async () => {
		const build = vi.fn(async () =>
			createBuildSuccess({ outputs: [{ path: '/tmp/out/entry.js', contentHashed: true }] }),
		);
		const appConfig = createAppConfig(build);
		const queue = installBuildQueue(appConfig);
		const queueBuild = vi.spyOn(queue, 'build');

		await new BrowserBundleService(appConfig).bundle({
			profile: 'browser-script',
			entrypoints: ['/tmp/entry.ts'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(queueBuild).toHaveBeenCalledWith(expect.objectContaining({ entrypoints: ['/tmp/entry.ts'] }), 'build');
		expect(build).toHaveBeenCalledTimes(1);
		expect(isHashedBrowserAsset('/tmp/out/entry.js')).toBe(true);
	});

	it.each(['hmr-entrypoint', 'hmr-runtime'] as const)('queues %s rebuilds on the hmr lane', async (profile) => {
		const build = vi.fn(async () => createBuildSuccess({ outputs: [{ path: '/tmp/out/entry.js' }] }));
		const appConfig = createAppConfig(build);
		const queue = installBuildQueue(appConfig);
		const queueBuild = vi.spyOn(queue, 'build');

		await new BrowserBundleService(appConfig).bundle({
			profile,
			entrypoints: ['/tmp/layout.tsx'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(queueBuild).toHaveBeenCalledWith(expect.objectContaining({ entrypoints: ['/tmp/layout.tsx'] }), 'hmr');
		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({ entrypoints: ['/tmp/layout.tsx'], target: 'browser', format: 'esm' }),
		);
	});

	it('adds the component identity transform to browser bundle builds', async () => {
		const build = vi.fn(async () => createBuildSuccess({ outputs: [{ path: '/tmp/out/entry.js' }] }));
		const appConfig = {
			runtime: {},
			loaders: new Map(),
			integrations: [{ name: 'react', extensions: ['.tsx'] }],
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build,
			resolve: () => '',
		});
		installBuildQueue(appConfig);

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
				plugins: expect.arrayContaining([
					expect.objectContaining({ name: 'eco-component-identity-attribution' }),
				]),
			}),
		);
	});

	it('passes grouped entry names to the build executor as named entrypoints', async () => {
		const build = vi.fn(async () => createBuildSuccess({ outputs: [{ path: '/tmp/out/page-entry.js' }] }));
		const appConfig = {
			runtime: {},
			loaders: new Map(),
			integrations: [],
		} as any;

		setAppBuildAdapterForTest(appConfig, {
			ownership: 'rolldown',
			build,
			resolve: () => '',
		});
		installBuildQueue(appConfig);

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
});

function setAppBuildAdapterForTest(appConfig: any, adapter: any): void {
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		buildAdapter: adapter,
	};
}

function createAppConfig(build: ReturnType<typeof vi.fn>): any {
	const appConfig = { runtime: {}, loaders: new Map(), integrations: [] } as any;
	setAppBuildAdapterForTest(appConfig, {
		ownership: 'rolldown',
		build,
		resolve: () => '',
	});
	return appConfig;
}
