import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { setupAppRuntimePlugins } from '@ecopages/core/build/build-adapter';
import { installBuildRuntime } from '@ecopages/core/build/build-runtime';
import { RouteRendererFactory } from '@ecopages/core/route-renderer/route-renderer';
import type { EcoPagesAppConfig, PageParams, PageQuery } from '@ecopages/core';
import type {
	LitStaticRenderCacheStrategy,
	LitStaticRenderWorkerRequestMessage,
	LitStaticRenderWorkerResponseMessage,
} from './lit-static-render-protocol.ts';
import './dom-shim.ts';

let appConfig: EcoPagesAppConfig | null = null;
let routeRendererFactory: RouteRendererFactory | null = null;

/**
 * Loads app config in the worker isolate and bootstraps rendering.
 *
 * @remarks
 * Processor `.setup()` is skipped here — the main thread already prepared disk artifacts
 * before the Lit worker started (`ECOPAGES_LIT_STATIC_RENDER_WORKER`).
 */
async function initializeWorker(configModulePath: string, runtimeOrigin: string): Promise<void> {
	const configModule = await import(/* @vite-ignore */ pathToFileURL(configModulePath).href);
	appConfig = (configModule.default ?? configModule) as EcoPagesAppConfig;

	await setupAppRuntimePlugins({
		appConfig,
		runtimeOrigin,
	});

	installBuildRuntime(appConfig);

	routeRendererFactory = new RouteRendererFactory({
		appConfig,
		runtimeOrigin,
	});
}

async function renderPage(
	filePath: string,
	params: PageParams,
	query?: PageQuery,
): Promise<{ html: string; cacheStrategy?: LitStaticRenderCacheStrategy }> {
	if (!routeRendererFactory) {
		throw new Error('Lit static render worker is not initialized');
	}

	const result = await routeRendererFactory.getPageRenderer(filePath).execute({
		file: filePath,
		params,
		query,
	});

	const body = result.body;
	if (typeof body === 'string') {
		return { html: body, cacheStrategy: result.cacheStrategy };
	}

	if (Buffer.isBuffer(body)) {
		return { html: body.toString('utf8'), cacheStrategy: result.cacheStrategy };
	}

	if (body instanceof ReadableStream) {
		return { html: await new Response(body).text(), cacheStrategy: result.cacheStrategy };
	}

	throw new TypeError(`Unsupported Lit static render body type: ${typeof body}`);
}

function postMessage(message: LitStaticRenderWorkerResponseMessage): void {
	parentPort?.postMessage(message);
}

if (!parentPort) {
	throw new Error('Lit static render worker must be started as a worker thread');
}

parentPort.on('message', async (message: LitStaticRenderWorkerRequestMessage) => {
	try {
		if (message.type === 'init') {
			await initializeWorker(message.configModulePath, message.runtimeOrigin);
			postMessage({ type: 'ready' });
			return;
		}

		if (message.type === 'shutdown') {
			process.exit(0);
			return;
		}

		if (message.type === 'render') {
			const result = await renderPage(message.filePath, message.params, message.query);
			postMessage({ type: 'result', id: message.id, ...result });
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (message.type === 'render') {
			postMessage({ type: 'error', id: message.id, message: errorMessage });
			return;
		}

		postMessage({ type: 'error', message: errorMessage });
	}
});
