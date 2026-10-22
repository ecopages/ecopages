import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, onTestFinished, test, vi } from 'vitest';
import { HMR_RUNTIME_SCRIPT_URL } from '../../../hmr/hmr-runtime-paths.ts';
import { injectDevClientRuntimes } from '../../../hmr/dev-client-runtime.ts';
import type { AppRuntime } from '../../../config/assembly/app-runtime.ts';
import { createAppRuntime } from '../../../config/assembly/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../../../config/assembly/finalize-config.ts';
import type { EcoPagesAppConfig } from '../../../config/internal-types.ts';
import type { ApiHandler, ErrorHandler, IHmrManager, StaticRoute } from '../../../types/contracts.ts';
import { eco } from '../../../eco/eco.ts';
import { defineIntegration } from '../../../plugins/define-integration.ts';
import { StringMarkupRenderer } from '../../../route-renderer/orchestration/string-markup-renderer.ts';
import { ServerRequestPipeline } from './server-request-pipeline.ts';
import { appLogger } from '../../../global/app-logger.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function createHmrAssetManager(runtimePath: string, enabled = true): IHmrManager {
	return {
		registerEntrypoint: vi.fn(),
		registerScriptEntrypoint: vi.fn(),
		registerStrategy: vi.fn(),
		registerDevTransformContributor: vi.fn(),
		setEnabled: vi.fn(),
		stop: vi.fn(),
		isEnabled: vi.fn(() => enabled),
		broadcast: vi.fn(),
		getWatchedFiles: vi.fn(() => new Map()),
		getRegisteredEntrypoints: vi.fn(() => new Map()),
		tryHandleDevClientRequest: vi.fn(async () => null),
		tryHandleAssetRequest: (request: Request) => {
			const url = new URL(request.url);
			if (url.pathname === HMR_RUNTIME_SCRIPT_URL && fs.existsSync(runtimePath)) {
				return new Response(fs.readFileSync(runtimePath), {
					headers: {
						'Content-Type': 'application/javascript',
						'Cache-Control': 'no-store, must-revalidate',
					},
				});
			}
			return null;
		},
		injectDevClientRuntimes: (response: Response) =>
			injectDevClientRuntimes(response, [
				{
					name: 'HMR',
					url: HMR_RUNTIME_SCRIPT_URL,
					workDir: '',
					resolveEntry: () => '',
					onFailure: () => {},
				},
			]),
		getDefaultContext: vi.fn(),
		handleFileChanges: vi.fn(),
	};
}

class TestServerRequestPipeline extends ServerRequestPipeline {
	public async handleRequest(request: Request): Promise<Response> {
		this.runtime.hmr = createHmrAssetManager('');
		return await this.handleSharedRequest(request, {
			apiHandlers: [],
		});
	}

	public async handleSharedRequestForTest(
		request: Request,
		apiHandlers: ApiHandler[],
		hmrManager?: IHmrManager,
	): Promise<Response> {
		this.runtime.hmr = hmrManager ?? null;
		return await this.handleSharedRequest(request, {
			apiHandlers,
		});
	}

	public setRouteHandlerForTest(handleResponse: (request: Request) => Promise<Response>): void {
		this.routeHandler = {
			handleResponse,
		} as any;
	}

	public async handleUnexpectedRequestErrorForTest(
		error: unknown,
		request: Request,
		errorHandler: ErrorHandler,
	): Promise<Response> {
		return await this.handleUnexpectedRequestError(error, request, { apiHandlers: [], errorHandler });
	}

	public setWatchModeForTest(watch: boolean): void {
		(this as unknown as { watchMode: boolean }).watchMode = watch;
	}

	public createPageCacheServiceForTest() {
		return this['createSharedPageCacheServiceFromConfig']();
	}

	constructor(rootDir: string, appConfig?: EcoPagesAppConfig, options: { watch?: boolean } = {}) {
		const config =
			appConfig ??
			({
				rootDir,
				baseUrl: 'http://localhost:3000',
				loaders: new Map(),
				processors: new Map(),
				integrations: [],
			} as unknown as EcoPagesAppConfig);
		const runtime: AppRuntime = config.appRuntime ?? createAppRuntime(config);
		super({
			appConfig: config,
			runtime,
			watch: options.watch,
		});
	}
}

test.each([
	{ name: 'disabled by default in watch mode', watch: true, enabled: undefined, expected: false },
	{ name: 'enabled in watch mode when opted in', watch: true, enabled: true, expected: true },
	{ name: 'enabled by default outside watch mode', watch: false, enabled: undefined, expected: true },
	{ name: 'disabled when explicitly disabled', watch: false, enabled: false, expected: false },
])('ServerRequestPipeline leaves page caching $name', async ({ watch, enabled, expected }) => {
	const rootDir = createTempRoot('ecopages-shared-server-cache-config');
	const appConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		cache: enabled === undefined ? undefined : { enabled },
	});
	const adapter = new TestServerRequestPipeline(rootDir, appConfig, { watch });

	assert.equal(adapter.createPageCacheServiceForTest() !== null, expected);
});

test('ServerRequestPipeline dispatches matching API handlers before filesystem routes', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-api-dispatch');
	const adapter = new TestServerRequestPipeline(rootDir);
	adapter.setRouteHandlerForTest(async () => new Response('filesystem'));

	const response = await adapter.handleSharedRequestForTest(
		new Request('http://localhost/api/posts/123', { method: 'GET' }),
		[
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: ({ params }) => new Response(`api:${params.id}`),
			},
		],
	);

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'api:123');
});

test('ServerRequestPipeline falls back to the route handler when no API handler matches', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-route-fallback');
	const adapter = new TestServerRequestPipeline(rootDir);
	adapter.setRouteHandlerForTest(async () => new Response('filesystem'));

	const response = await adapter.handleSharedRequestForTest(
		new Request('http://localhost/blog/post-1', { method: 'GET' }),
		[
			{
				path: '/api/posts/[id]',
				method: 'GET',
				handler: () => new Response('api'),
			},
		],
	);

	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'filesystem');
});

test('ServerRequestPipeline injects HMR script into HTML responses in watch mode', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-hmr-inject');
	const adapter = new TestServerRequestPipeline(rootDir);
	adapter.setWatchModeForTest(true);
	const hmrManager = createHmrAssetManager('');
	adapter.setRouteHandlerForTest(
		async () =>
			new Response('<html><body></body></html>', {
				headers: { 'Content-Type': 'text/html' },
			}),
	);

	const response = await adapter.handleSharedRequestForTest(new Request('http://localhost/test'), [], hmrManager);
	const text = await response.text();

	assert.ok(text.includes("import '/_hmr_runtime.js'"));
	assert.equal(response.headers.get('Cache-Control'), 'no-store, must-revalidate');
});

test('ServerRequestPipeline leaves HTML responses untouched while the HMR manager is disabled', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-hmr-no-inject');
	const adapter = new TestServerRequestPipeline(rootDir);
	adapter.setWatchModeForTest(true);
	const hmrManager = createHmrAssetManager('', false);
	adapter.setRouteHandlerForTest(
		async () =>
			new Response('<html><body></body></html>', {
				headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=60' },
			}),
	);

	const response = await adapter.handleSharedRequestForTest(new Request('http://localhost/test'), [], hmrManager);

	assert.equal(await response.text(), '<html><body></body></html>');
	assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
});

test('ServerRequestPipeline keeps an HTML error response out of the browser cache only in watch mode', async () => {
	const rootDir = createTempRoot('ecopages-shared-server-unexpected-error');
	const adapter = new TestServerRequestPipeline(rootDir);
	const renderErrorPage: ErrorHandler = () =>
		new Response('<html><body>Error</body></html>', {
			status: 500,
			headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=60' },
		});
	const handle = () =>
		adapter.handleUnexpectedRequestErrorForTest(
			new Error('boom'),
			new Request('http://localhost/test'),
			renderErrorPage,
		);

	const outsideWatch = await handle();
	assert.equal(outsideWatch.headers.get('Cache-Control'), 'public, max-age=60');

	adapter.setWatchModeForTest(true);
	const inWatch = await handle();
	assert.equal(inWatch.status, 500);
	assert.equal(await inWatch.text(), '<html><body>Error</body></html>');
	assert.equal(inWatch.headers.get('Cache-Control'), 'no-store, must-revalidate');
});

test('RouteRegistry page module adapter loads page modules through integration renderers', async () => {
	const rootDir = createTempRoot('ecopages-route-registry-page-module-adapter');
	const config = await finalizeEcoPagesConfig({ rootDir });
	const adapter = new TestServerRequestPipeline(rootDir);
	(adapter as unknown as { appConfig: typeof config }).appConfig = config;

	const loadPageModule = vi.fn(async () => ({
		default: {
			staticPaths: async () => ({ paths: [] }),
		},
	}));
	const getPageRenderer = vi.fn(() => ({
		loadPageModule,
		execute: vi.fn(),
	}));
	(adapter as unknown as { routeRendererFactory: { getPageRenderer: typeof getPageRenderer } }).routeRendererFactory =
		{ getPageRenderer };

	const pageModuleAdapter = (
		adapter as unknown as {
			createRouteRegistryPageModuleAdapter: () => { loadPageModule: (filePath: string) => Promise<unknown> };
		}
	).createRouteRegistryPageModuleAdapter();
	const result = await pageModuleAdapter.loadPageModule('/pages/blog/[slug].tsx');

	assert.deepEqual(getPageRenderer.mock.calls, [['/pages/blog/[slug].tsx']]);
	assert.deepEqual(loadPageModule.mock.calls, [['/pages/blog/[slug].tsx']]);
	assert.equal(typeof (result as { staticPaths?: unknown }).staticPaths, 'function');
});

describe('ServerRequestPipeline endpoint files', () => {
	const helpersPath = JSON.stringify(path.resolve(import.meta.dirname, '../http/define-api-handler.ts'));
	const textBodySchema = `{
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) =>
				typeof value?.text === 'string' ? { value } : { issues: [{ message: 'text is required' }] },
		},
	}`;

	class StringRenderer extends StringMarkupRenderer {
		name = 'string';
		override async getHtmlTemplate() {
			return ({ children }: { children?: unknown }) => `<html><body>${String(children ?? '')}</body></html>`;
		}
	}
	const stringIntegration = defineIntegration({
		name: 'string',
		extensions: ['.string.ts'],
		renderer: StringRenderer,
	});

	async function createEndpointApp(
		files: Record<string, string>,
		options: { apiHandlers?: ApiHandler[]; errorHandler?: ErrorHandler; staticRoutes?: StaticRoute[] } = {},
	) {
		const rootDir = createTempRoot('ecopages-endpoint-files');
		for (const [file, source] of Object.entries(files)) {
			const filePath = path.join(rootDir, 'src', 'pages', file);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, source);
		}
		const appConfig = await finalizeEcoPagesConfig({ rootDir, integrations: [stringIntegration()] });
		const pipeline = new ServerRequestPipeline({ appConfig, runtime: appConfig.appRuntime!, watch: false });
		const apiHandlers = options.apiHandlers ?? [];
		const initialize = () =>
			pipeline.initializeRouteHandling({ staticRoutes: options.staticRoutes ?? [], apiHandlers });
		await initialize();

		return {
			rootDir,
			appConfig,
			pipeline,
			initialize,
			fetch: (url: string, init?: RequestInit) =>
				pipeline.handleSharedRequest(new Request(`http://localhost${url}`, init), {
					apiHandlers,
					errorHandler: options.errorHandler,
				}),
		};
	}

	test('answers a request with the handler exported for its method', async () => {
		const app = await createEndpointApp({
			'health.api.ts': `import { defineGet } from ${helpersPath};
				export const GET = defineGet({ handler: ({ response }) => response.json({ ok: true }) });
				export const notAMethod = 'ignored';`,
		});

		const response = await app.fetch('/health');

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { ok: true });
	});

	test('passes the Template Route params, with a catch-all as an array', async () => {
		const echoParams = `import { defineGet } from ${helpersPath};
			export const GET = defineGet({ handler: ({ params, response }) => response.json(params) });`;
		const app = await createEndpointApp({
			'blog/[slug]/comments.api.ts': echoParams,
			'docs/[...slug].api.ts': echoParams,
		});

		assert.deepEqual(await (await app.fetch('/blog/hello/comments')).json(), { slug: 'hello' });
		assert.deepEqual(await (await app.fetch('/docs/a/b')).json(), { slug: ['a', 'b'] });
	});

	test('validates the request body against the handler schema', async () => {
		const app = await createEndpointApp({
			'comments.api.ts': `import { definePost } from ${helpersPath};
				export const POST = definePost({
					schema: { body: ${textBodySchema} },
					handler: ({ body, response }) => response.status(201).json(body),
				});`,
		});
		const post = (body: unknown) =>
			app.fetch('/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});

		assert.equal((await post({ text: 'hi' })).status, 201);
		const invalid = await post({});
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error, 'Validation failed');
	});

	test('sends a thrown error to app.onError with the handler context', async () => {
		const errorHandler = vi.fn<ErrorHandler>((error, context) =>
			Response.json({ message: (error as Error).message, id: context.params.id }, { status: 418 }),
		);
		const app = await createEndpointApp(
			{
				'posts/[id].api.ts': `import { defineGet } from ${helpersPath};
					export const GET = defineGet({ handler: () => { throw new Error('No post'); } });`,
			},
			{ errorHandler },
		);

		const handled = await app.fetch('/posts/7');

		assert.equal(handled.status, 418);
		assert.deepEqual(await handled.json(), { message: 'No post', id: '7' });
	});

	test('answers a method the file does not export with 405 and the exported methods', async () => {
		const app = await createEndpointApp({
			'comments.api.ts': `import { defineGet, definePost } from ${helpersPath};
				export const POST = definePost({ handler: () => new Response('post') });
				export const GET = defineGet({ handler: () => new Response('get') });`,
		});

		const deleted = await app.fetch('/comments', { method: 'DELETE' });
		assert.equal(deleted.status, 405);
		assert.equal(deleted.headers.get('Allow'), 'GET, POST');
		const head = await app.fetch('/comments', { method: 'HEAD' });
		assert.equal(head.status, 405);
	});

	test.each([
		{
			name: 'exports no method handler',
			source: `export const handler = () => new Response('nope');`,
			message: 'exports no request handler',
		},
		{
			name: 'sets path on a method export',
			source: `import { defineGet } from ${helpersPath};
				export const GET = defineGet({ path: '/x', handler: () => new Response('x') });`,
			message: 'the GET export of the endpoint "/broken" sets path "/x"',
		},
		{
			name: 'exports a handler under another method name',
			source: `import { definePost } from ${helpersPath};
				export const GET = definePost({ handler: () => new Response('x') });`,
			message: 'the GET export of the endpoint "/broken" is a POST handler. Build it with defineGet()',
		},
		{
			name: 'exports a plain function as a method',
			source: `export const GET = () => new Response('x');`,
			message: 'the GET export of the endpoint "/broken" is not a request handler',
		},
	])('fails to load a file that $name, naming the file', async ({ source, message }) => {
		const errorHandler = vi.fn<ErrorHandler>(() => new Response('load error', { status: 500 }));
		const app = await createEndpointApp({ 'broken.api.ts': source }, { errorHandler });

		const response = await app.fetch('/broken');

		assert.equal(response.status, 500);
		const error = errorHandler.mock.calls[0]?.[0] as Error;
		assert.ok(error.message.includes(path.join(app.rootDir, 'src', 'pages', 'broken.api.ts')), error.message);
		assert.ok(error.message.includes(message), error.message);
	});

	test('lets an Explicit Route keep its method on an endpoint pathname and warns once per pair', async () => {
		const warn = vi.spyOn(appLogger, 'warn').mockReturnValue(appLogger);
		onTestFinished(() => warn.mockRestore());
		const app = await createEndpointApp(
			{
				'blog/[slug]/comments.api.ts': `import { defineGet, definePost } from ${helpersPath};
					export const GET = defineGet({ handler: () => new Response('file get') });
					export const POST = definePost({ handler: ({ params }) => new Response(\`file post \${params.slug}\`) });`,
			},
			{
				apiHandlers: [
					{ path: '/blog/:slug/comments', method: 'GET', handler: () => new Response('app get') },
					{ path: '/blog/:slug', method: 'GET', handler: () => new Response('app page') },
				],
			},
		);
		await app.initialize();
		fs.writeFileSync(
			path.join(app.rootDir, 'src', 'pages', 'blog', '[slug].api.ts'),
			`import { definePost } from ${helpersPath};
			export const POST = definePost({ handler: () => new Response('file post page') });`,
		);
		await app.initialize();

		assert.equal(await (await app.fetch('/blog/hello/comments')).text(), 'app get');
		assert.equal(await (await app.fetch('/blog/hello/comments', { method: 'POST' })).text(), 'file post hello');
		assert.equal(await (await app.fetch('/blog/hello')).text(), 'app page');
		assert.equal(await (await app.fetch('/blog/hello', { method: 'POST' })).text(), 'file post page');
		const warnings = warn.mock.calls.map(([warning]) => String(warning));
		assert.equal(warnings.length, 2);
		assert.ok(warnings[0]!.includes('GET /blog/:slug/comments'), warnings[0]);
		assert.ok(
			warnings[0]!.includes(path.join(app.rootDir, 'src', 'pages', 'blog', '[slug]', 'comments.api.ts')),
			warnings[0],
		);
		assert.ok(warnings[1]!.includes('GET /blog/:slug and the endpoint file'), warnings[1]);
	});
	test('serves the fixed module after a dev save repairs a syntax error', async () => {
		const errorHandler = vi.fn<ErrorHandler>(() => new Response('load error', { status: 500 }));
		const app = await createEndpointApp(
			{ 'health.api.ts': `export const GET = defineGet({ handler: () => new Response('ok') ` },
			{ errorHandler },
		);

		assert.equal((await app.fetch('/health')).status, 500);
		assert.equal(errorHandler.mock.calls.length, 1);

		fs.writeFileSync(
			path.join(app.rootDir, 'src', 'pages', 'health.api.ts'),
			`import { defineGet } from ${helpersPath};
			export const GET = defineGet({ handler: () => new Response('fixed') });`,
		);
		app.appConfig.appRuntime!.moduleLoader.invalidateDevelopmentGraph();

		const fixed = await app.fetch('/health');
		assert.equal(fixed.status, 200);
		assert.equal(await fixed.text(), 'fixed');
	});

	test('answers an app.static route before an endpoint file on the same pathname', async () => {
		const staticPage = eco.page({ integration: 'string', render: () => '<p>static about</p>' });
		const app = await createEndpointApp(
			{
				'about.api.ts': `import { defineGet } from ${helpersPath};
					export const GET = defineGet({ handler: () => new Response('endpoint about') });`,
			},
			{ staticRoutes: [{ path: '/about', loader: async () => ({ default: staticPage }) }] },
		);

		const response = await app.fetch('/about');

		assert.equal(response.status, 200);
		assert.ok((await response.text()).includes('<p>static about</p>'));
	});

	test('sends an error from a prewarmed endpoint to app.onError', async () => {
		const errorHandler = vi.fn<ErrorHandler>(() => new Response('handled', { status: 500 }));
		const app = await createEndpointApp({
			'health.api.ts': `import { defineGet } from ${helpersPath};
				export const GET = defineGet({ handler: () => { throw new Error('prewarm failure'); } });`,
		});

		await app.pipeline.renderDevPrewarmPath('/health', 'http://localhost', { errorHandler });

		assert.equal((errorHandler.mock.calls[0]?.[0] as Error | undefined)?.message, 'prewarm failure');
	});
});
