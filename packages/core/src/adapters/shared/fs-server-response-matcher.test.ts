import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { APP_TEST_ROUTES, FIXTURE_APP_PROJECT_DIR, INDEX_TEMPLATE_FILE } from '../../../__fixtures__/constants.js';
import { ConfigBuilder } from '../../config/config-builder.ts';
import type { MatchResult } from '../../internal-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { MemoryCacheStore } from '../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../services/cache/page-cache-service.ts';
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

describe('FileSystemResponseMatcher', () => {
	describe('without cache service', () => {
		const matcherWithoutCache = new FileSystemResponseMatcher({
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
		});

		it('should return custom 404 page for unmatched request URL', async () => {
			const requestUrl = APP_TEST_ROUTES.nonExistentFile;
			const response = await matcherWithoutCache.handleNoMatch(requestUrl);
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should handle match with disabled cache headers', async () => {
			const match: MatchResult = {
				kind: 'exact',
				pathname: APP_TEST_ROUTES.index,
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};
			const response = await matcherWithoutCache.handleMatch(match);
			expect(response.headers.get('Content-Type')).toBe('text/html');
			expect(response.headers.get('X-Cache')).toBe('DISABLED');
			expect(response.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
		});

		it('should return null for getCacheService when not configured', () => {
			expect(matcherWithoutCache.getCacheService()).toBeNull();
		});
	});

	describe('with cache service', () => {
		const cacheService = new PageCacheService({
			store: new MemoryCacheStore(),
			enabled: true,
		});

		const matcherWithCache = new FileSystemResponseMatcher({
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: 'static',
		});

		it('should return cache service via getCacheService', () => {
			expect(matcherWithCache.getCacheService()).toBe(cacheService);
		});

		it('should return X-Cache header on first request (MISS)', async () => {
			const match: MatchResult = {
				kind: 'exact',
				pathname: '/cache-test-miss',
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};
			const response = await matcherWithCache.handleMatch(match);
			expect(response.headers.get('X-Cache')).toBe('MISS');
			expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
		});

		it('should return X-Cache HIT on second request to same path', async () => {
			const uniquePath = `/cache-test-hit-${Date.now()}`;
			const match: MatchResult = {
				kind: 'exact',
				pathname: uniquePath,
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};

			const response1 = await matcherWithCache.handleMatch(match);
			const response2 = await matcherWithCache.handleMatch(match);

			expect(response1.headers.get('X-Cache')).toBe('MISS');
			expect(response2.headers.get('X-Cache')).toBe('HIT');
		});

		it('should cache different paths separately', async () => {
			const match1: MatchResult = {
				kind: 'exact',
				pathname: '/path-a',
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};
			const match2: MatchResult = {
				kind: 'exact',
				pathname: '/path-b',
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};

			const response1 = await matcherWithCache.handleMatch(match1);
			const response2 = await matcherWithCache.handleMatch(match2);

			expect(response1.headers.get('X-Cache')).toBe('MISS');
			expect(response2.headers.get('X-Cache')).toBe('MISS');
		});

		it('should include query params in cache key', async () => {
			const basePath = `/search-${Date.now()}`;
			const matchWithQuery: MatchResult = {
				kind: 'exact',
				pathname: basePath,
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: { q: 'test' },
			};
			const matchWithDifferentQuery: MatchResult = {
				kind: 'exact',
				pathname: basePath,
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: { q: 'other' },
			};

			const firstCall = await matcherWithCache.handleMatch(matchWithQuery);
			const response1 = await matcherWithCache.handleMatch(matchWithQuery);
			const response2 = await matcherWithCache.handleMatch(matchWithDifferentQuery);

			expect(firstCall.headers.get('X-Cache')).toBe('MISS');
			expect(response1.headers.get('X-Cache')).toBe('HIT');
			expect(response2.headers.get('X-Cache')).toBe('MISS');
		});
	});

	describe('with dynamic cache strategy', () => {
		const cacheService = new PageCacheService({
			store: new MemoryCacheStore(),
			enabled: true,
		});

		const dynamicMatcher = new FileSystemResponseMatcher({
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: 'dynamic',
		});

		it('should always return MISS for dynamic strategy', async () => {
			const match: MatchResult = {
				kind: 'exact',
				pathname: '/dynamic-page',
				filePath: INDEX_TEMPLATE_FILE,
				params: {},
				query: {},
			};

			const response1 = await dynamicMatcher.handleMatch(match);
			const response2 = await dynamicMatcher.handleMatch(match);

			expect(response1.headers.get('X-Cache')).toBe('MISS');
			expect(response2.headers.get('X-Cache')).toBe('MISS');
			expect(response1.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
		});
	});

	describe('handleNoMatch content type behavior', () => {
		const matcher = new FileSystemResponseMatcher({
			router,
			routeRendererFactory,
			fileSystemResponseFactory,
		});

		it('should return custom 404 page for known extension like .html', async () => {
			const response = await matcher.handleNoMatch('/non-existent-page.html');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for page requests without extension', async () => {
			const response = await matcher.handleNoMatch('/non-existent-page');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for unknown extensions', async () => {
			const response = await matcher.handleNoMatch('/page.xyz');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should return custom 404 page for trailing dot', async () => {
			const response = await matcher.handleNoMatch('/page.');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});

		it('should serve text/plain files from disk', async () => {
			const response = await matcher.handleNoMatch('/robots.txt');
			expect(response.headers.get('Content-Type')).toBe('text/plain');
		});

		it('should return custom 404 page for non-existent static files', async () => {
			const response = await matcher.handleNoMatch('/non-existent.txt');
			const body = await response.text();
			expect(body).toContain('<h1>404 - Page Not Found</h1>');
		});
	});
});
