import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import {
	attachHmrToIntegrations,
	disposeDevResources,
} from '../../adapters/shared/runtime/runtime-server-lifecycle.ts';
import { ensureIntegrationRuntimeReady, setupAppRuntimePlugins } from '../../build/app-build-manifest-runtime.ts';
import { requireBuildQueue } from '../../build/runtime/build-queue.ts';
import { createBrowserBuildRequest, resolveAppBuildPlugins } from '../../build/runtime/build-request-policy.ts';
import { ensurePagesUnifiedGraphBuilt } from '../../build/cache/pages-unified-graph-build.ts';
import { getHtmlPageModuleScriptUrls, scanModuleScript } from '../../html-pages/html-page-module-scripts.ts';
import {
	getAffectedPageBrowserGraphIdentities,
	invalidatePageBrowserGraphSession,
} from '../../route-renderer/orchestration/page-browser-graph/page-browser-graph-session.ts';
import { AssetProcessingService } from '../../assets/asset-processing-service/asset-processing.service.ts';
import { clearAppPageCache, invalidateAppPageCacheBySourcePaths } from '../../page-cache/page-cache-service.ts';
import { AppModuleLoader } from '../../build/server/app-module-loader.service.ts';
import {
	clearAppDevelopmentRouteModuleBuildCaches,
	getSharedRouteModuleBuildCache,
} from '../../build/server/route-module-build-cache-registry.ts';
import { createAppRuntime, requireAppRuntime } from './app-runtime.ts';
import { finalizeEcoPagesConfig } from './finalize-config.ts';

describe('AppRuntime', () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	function tempRoot(): string {
		const dir = mkdtempSync(path.join(tmpdir(), 'eco-app-runtime-'));
		tempDirs.push(dir);
		return dir;
	}

	it('throws for a config that was never assembled, naming the missing runtime', async () => {
		const unfinalized = {} as EcoPagesAppConfig;
		const missingRuntime = 'Missing app runtime. This config was never assembled.';

		expect(() => requireAppRuntime(unfinalized)).toThrow(missingRuntime);
		expect(() => createAppRuntime({} as EcoPagesAppConfig)).toThrow(missingRuntime);
		expect(() => requireBuildQueue(unfinalized)).toThrow(missingRuntime);
		expect(() => resolveAppBuildPlugins(unfinalized, 'server')).toThrow(missingRuntime);
		expect(() => createBrowserBuildRequest(unfinalized, { entrypoints: ['/in.ts'] })).toThrow(missingRuntime);
		expect(() => getSharedRouteModuleBuildCache('/out', unfinalized)).toThrow(missingRuntime);
		expect(() => clearAppDevelopmentRouteModuleBuildCaches(unfinalized)).toThrow(missingRuntime);
		expect(() => new AssetProcessingService(unfinalized)).toThrow(missingRuntime);
		await expect(clearAppPageCache(unfinalized)).rejects.toThrow(missingRuntime);
		await expect(invalidateAppPageCacheBySourcePaths(unfinalized, ['/in.ts'])).rejects.toThrow(missingRuntime);
		expect(() => invalidatePageBrowserGraphSession(unfinalized, '/in.ts')).toThrow(missingRuntime);
		expect(() => getAffectedPageBrowserGraphIdentities(unfinalized, '/in.ts')).toThrow(missingRuntime);
		expect(() => new AppModuleLoader(unfinalized).getDevelopmentGeneration()).toThrow(missingRuntime);
		expect(() => attachHmrToIntegrations(unfinalized)).toThrow(missingRuntime);
		await expect(
			disposeDevResources({
				appConfig: unfinalized,
			}),
		).rejects.toThrow(missingRuntime);
		await expect(setupAppRuntimePlugins({ appConfig: unfinalized })).rejects.toThrow(missingRuntime);
		await expect(
			ensureIntegrationRuntimeReady({
				appConfig: unfinalized,
				integrationName: 'react',
			}),
		).rejects.toThrow(missingRuntime);
		expect(() => getHtmlPageModuleScriptUrls(unfinalized)).toThrow(missingRuntime);
		expect(() => scanModuleScript(unfinalized, '/in.ts')).toThrow(missingRuntime);
		await expect(
			ensurePagesUnifiedGraphBuilt({
				appConfig: unfinalized,
				entryPaths: [],
				outdir: '/out',
			}),
		).rejects.toThrow(missingRuntime);
	});

	it('assembles one runtime for a finalized config and keeps a second config separate', async () => {
		const first = await finalizeEcoPagesConfig({
			rootDir: tempRoot(),
			baseUrl: 'http://first.test',
		});
		const second = await finalizeEcoPagesConfig({
			rootDir: tempRoot(),
			baseUrl: 'http://second.test',
		});
		const firstRuntime = requireAppRuntime(first);
		const secondRuntime = requireAppRuntime(second);

		expect(createAppRuntime(first)).toBe(firstRuntime);
		expect(firstRuntime).not.toBe(secondRuntime);
		expect(firstRuntime.buildInputIndex).not.toBe(secondRuntime.buildInputIndex);
		expect(firstRuntime.htmlPageWarnings).not.toBe(secondRuntime.htmlPageWarnings);
		expect(firstRuntime.customElementSsrPreloadScopes).not.toBe(secondRuntime.customElementSsrPreloadScopes);
		expect(firstRuntime.requestPipelineMetrics).not.toBe(secondRuntime.requestPipelineMetrics);
		expect(firstRuntime.origin).toBe('http://first.test');
		expect(firstRuntime.hmr).toBeNull();
		expect(firstRuntime.pageCache).toBeNull();
		expect(firstRuntime.buildAdapter).not.toBe(secondRuntime.buildAdapter);
		expect(firstRuntime.moduleLoader.getDevelopmentGeneration()).toBe(0);

		firstRuntime.moduleLoader.invalidateDevelopmentGraph();

		expect(firstRuntime.serverInvalidation.currentGeneration()).toBe(1);
		expect(firstRuntime.moduleLoader.getDevelopmentGeneration()).toBe(1);
		expect(secondRuntime.moduleLoader.getDevelopmentGeneration()).toBe(0);
	});

	it('rolls back appConfig.appRuntime when manifest sealing throws', async () => {
		const config = await finalizeEcoPagesConfig({ rootDir: tempRoot() });
		config.appRuntime = undefined;
		config.loaders = new Map([
			['first', { name: 'duplicate-plugin', setup() {} }],
			['second', { name: 'duplicate-plugin', setup() {} }],
		]);

		expect(() => createAppRuntime(config)).toThrow(/duplicate-plugin/);
		expect(config.appRuntime).toBeUndefined();
	});
});
