import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeStaticPreviewHost } from './static-preview-host.ts';

type TestPreviewServer = {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
};

/**
 * Creates a constructable preview-server class so the host can instantiate the
 * test double through the same code path it uses in production.
 */
function createPreviewServerFactory(previewServer: TestPreviewServer) {
	/**
	 * Constructable preview-server wrapper used by the host tests.
	 */
	return class TestPreviewServerFactory {
		constructor(_args: unknown) {}

		public start = previewServer.start;
		public stop = previewServer.stop;
	};
}

/**
 * Returns the smallest app config surface required by the preview-host tests.
 */
function createAppConfig(): EcoPagesAppConfig {
	return {
		rootDir: '/tmp/app',
		distDir: '.ecopages',
		runtime: {},
	} as unknown as EcoPagesAppConfig;
}

describe('NodeStaticPreviewHost', () => {
	it('coalesces overlapping stop calls onto one server shutdown', async () => {
		let resolveStop: (() => void) | undefined;
		const previewServer: TestPreviewServer = {
			start: vi.fn().mockResolvedValue({
				address: () => ({ port: 4173 }),
			}),
			stop: vi.fn().mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						resolveStop = resolve;
					}),
			),
		};

		const host = new NodeStaticPreviewHost(createPreviewServerFactory(previewServer) as never);

		await host.start({
			appConfig: createAppConfig(),
			hostname: 'localhost',
			port: 4173,
		});

		const firstStop = host.stop();
		const secondStop = host.stop();

		expect(previewServer.stop).toHaveBeenCalledTimes(1);

		resolveStop?.();
		await Promise.all([firstStop, secondStop]);
	});

	it('keeps the active server reference when shutdown fails so stop can be retried', async () => {
		const previewServer: TestPreviewServer = {
			start: vi.fn().mockResolvedValue({
				address: () => ({ port: 4173 }),
			}),
			stop: vi.fn().mockRejectedValueOnce(new Error('close failed')).mockResolvedValueOnce(undefined),
		};

		const host = new NodeStaticPreviewHost(createPreviewServerFactory(previewServer) as never);

		await host.start({
			appConfig: createAppConfig(),
			hostname: 'localhost',
			port: 4173,
		});

		await expect(host.stop()).rejects.toThrow('close failed');
		await expect(host.stop()).resolves.toBeUndefined();
		expect(previewServer.stop).toHaveBeenCalledTimes(2);
	});
});
