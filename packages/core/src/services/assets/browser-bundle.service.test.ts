import { describe, expect, it, vi } from 'vitest';
import { ViteHostBuildAdapter } from '../../build/build-adapter.ts';
import { BrowserBundleService } from './browser-bundle.service.ts';

describe('BrowserBundleService', () => {
	it('routes browser bundle requests through the app executor with profile defaults', async () => {
		const build = vi.fn(async () => ({
			success: true,
			logs: [],
			outputs: [{ path: '/tmp/out/entry.js' }],
		}));
		const service = new BrowserBundleService({
			runtime: {
				buildAdapter: {
					getTranspileOptions: () => ({
						target: 'browser',
						format: 'esm',
						sourcemap: 'none',
					}),
				},
				buildExecutor: { build },
			},
			loaders: new Map(),
		} as any);

		await service.bundle({
			profile: 'browser-script',
			entrypoints: ['/tmp/entry.ts'],
			outdir: '/tmp/out',
			minify: false,
			naming: '[name].js',
		});

		expect(build).toHaveBeenCalledWith(
			expect.objectContaining({
				entrypoints: ['/tmp/entry.ts'],
				outdir: '/tmp/out',
				target: 'browser',
				format: 'esm',
				sourcemap: 'none',
			}),
		);
	});

	it('fails fast when a Vite-hosted app tries to use the Bun browser bundle seam', async () => {
		const service = new BrowserBundleService({
			runtime: {
				buildAdapter: new ViteHostBuildAdapter(),
				buildExecutor: {
					build: vi.fn(),
				},
			},
			loaders: new Map(),
		} as any);

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
