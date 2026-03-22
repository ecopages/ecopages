import { describe, expect, it, vi } from 'vitest';
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
});
