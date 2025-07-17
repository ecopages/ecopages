import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { APP_TEST_ROUTES, FIXTURE_APP_PROJECT_DIR, INDEX_TEMPLATE_FILE } from '../../../fixtures/constants.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
import { STATUS_MESSAGE } from '../../constants.ts';
import type { MatchResult } from '../../internal-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from './fs-server-response-matcher.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

for (const integration of appConfig.integrations) {
	integration.setConfig(appConfig);
	integration.setRuntimeOrigin(appConfig.baseUrl);
}

const scanner = new FSRouterScanner({
	dir: path.join(appConfig.rootDir, appConfig.srcDir, appConfig.pagesDir),
	appConfig,
	origin: appConfig.baseUrl,
	templatesExt: appConfig.templatesExt,
	options: {
		buildMode: false,
	},
});

const router = new FSRouter({
	origin: appConfig.baseUrl,
	assetPrefix: path.join(appConfig.rootDir, appConfig.distDir),
	scanner,
});

const routeRendererFactory = new RouteRendererFactory({
	appConfig,
	runtimeOrigin: appConfig.baseUrl,
});

const fileSystemResponseFactory = new FileSystemServerResponseFactory({
	appConfig,
	routeRendererFactory,
	options: {
		watchMode: false,
	},
});

const fileSystemResponseMatcher = new FileSystemResponseMatcher({
	router,
	routeRendererFactory,
	fileSystemResponseFactory,
});

describe('FileSystemResponseMatcher', () => {
	it('should handle no match for request URL', async () => {
		const requestUrl = APP_TEST_ROUTES.nonExistentFile;
		const response = await fileSystemResponseMatcher.handleNoMatch(requestUrl);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe(STATUS_MESSAGE[404]);
	});

	it('should handle match', async () => {
		const match: MatchResult = {
			kind: 'exact',
			pathname: APP_TEST_ROUTES.index,
			filePath: INDEX_TEMPLATE_FILE,
			params: {},
			query: {},
		};
		const response = await fileSystemResponseMatcher.handleMatch(match);
		expect(response.headers.get('Content-Type')).toBe('text/html');
	});
});
