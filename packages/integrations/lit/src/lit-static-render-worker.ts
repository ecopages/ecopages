import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { setupAppRuntimePlugins } from '@ecopages/core/build/build-adapter';
import { installAppRuntimeBuildExecutor } from '@ecopages/core/build/runtime-build-executor';
import { RouteRendererFactory } from '@ecopages/core/route-renderer/route-renderer';
import type { EcoPagesAppConfig } from '@ecopages/core';
import type {
	LitStaticRenderWorkerRequestMessage,
	LitStaticRenderWorkerResponseMessage,
} from './lit-static-render-protocol.ts';
import './dom-shim.ts';

let appConfig: EcoPagesAppConfig | null = null;
let routeRendererFactory: RouteRendererFactory | null = null;

async function initializeWorker(configModulePath: string, runtimeOrigin: string): Promise<void> {
	const configModule = await import(/* @vite-ignore */ pathToFileURL(configModulePath).href);
	appConfig = (configModule.default ?? configModule) as EcoPagesAppConfig;

	await setupAppRuntimePlugins({
		appConfig,
		runtimeOrigin,
	});

	installAppRuntimeBuildExecutor(appConfig);

	routeRendererFactory = new RouteRendererFactory({
		appConfig,
		runtimeOrigin,
	});
}

async function renderPage(filePath: string, params: Record<string, string>): Promise<string> {
	if (!routeRendererFactory) {
		throw new Error('Lit static render worker is not initialized');
	}

	const result = await routeRendererFactory.getPageRenderer(filePath).execute({
		file: filePath,
		params,
	});

	const body = result.body;
	if (typeof body === 'string') {
		return body;
	}

	if (Buffer.isBuffer(body)) {
		return body.toString('utf8');
	}

	if (body instanceof ReadableStream) {
		return new Response(body).text();
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
			const html = await renderPage(message.filePath, message.params);
			postMessage({ type: 'result', id: message.id, html });
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
