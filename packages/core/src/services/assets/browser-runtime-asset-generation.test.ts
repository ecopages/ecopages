import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { PageRequestCacheCoordinator } from '../cache/page-request-cache-coordinator.service.ts';
import {
	bumpBrowserRuntimeAssetGeneration,
	getBrowserRuntimeAssetGeneration,
} from './browser-runtime-asset-generation.ts';

describe('browser runtime asset generation', () => {
	it('includes generation in development cache keys and advances on bump', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const appConfig = { rootDir: '/tmp/eco-runtime-gen' } as EcoPagesAppConfig;

		expect(getBrowserRuntimeAssetGeneration(appConfig)).toBe(0);

		const coordinator = new PageRequestCacheCoordinator(null, 'static', () =>
			getBrowserRuntimeAssetGeneration(appConfig),
		);
		expect(coordinator.buildCacheKey({ pathname: '/' })).toBe('/#__eco_rt=0');

		await bumpBrowserRuntimeAssetGeneration(appConfig);
		expect(getBrowserRuntimeAssetGeneration(appConfig)).toBe(1);
		expect(coordinator.buildCacheKey({ pathname: '/' })).toBe('/#__eco_rt=1');
	});

	it('does not append generation outside development', () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appConfig = { rootDir: '/tmp/eco-runtime-gen-prod' } as EcoPagesAppConfig;
		const coordinator = new PageRequestCacheCoordinator(null, 'static', () =>
			getBrowserRuntimeAssetGeneration(appConfig),
		);

		expect(coordinator.buildCacheKey({ pathname: '/' })).toBe('/');
	});
});
