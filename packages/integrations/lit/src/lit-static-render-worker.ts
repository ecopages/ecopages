import { parentPort } from 'node:worker_threads';
import { loadEcoPagesConfig } from '@ecopages/core/config';
import {
	setupAppRuntimeIntegrations,
	setupAppRuntimePlugins,
	teardownAppRuntimeIntegrations,
} from '@ecopages/core/build';
import { installBuildQueue } from '@ecopages/core/build';
import { requireAppRuntime } from '@ecopages/core/integration';
import { RouteRendererFactory } from '@ecopages/core/integration';
import type { PageParams, PageQuery } from '@ecopages/core';
import type {
	LitStaticRenderResult,
	LitStaticRenderWorkerRequestMessage,
	LitStaticRenderWorkerResponseMessage,
} from './lit-static-render-protocol.ts';
import { toLitStaticRenderErrorMessage } from './lit-static-render-error.ts';
import { toLitStaticRenderResult } from './lit-static-render-result.ts';
import './dom-shim.ts';

type LoadedAppConfig = Awaited<ReturnType<typeof loadEcoPagesConfig>>;

let appConfig: LoadedAppConfig | null = null;
let routeRendererFactory: RouteRendererFactory | null = null;
let activeRenders = 0;
let shutdownRequested = false;
let resolveRendersIdle: (() => void) | undefined;

/**
 * Loads app config in the worker isolate and bootstraps rendering.
 *
 * @remarks
 * Processor `.setup()` is skipped here because the main thread already prepared disk artifacts
 * before the Lit worker started (`ECOPAGES_LIT_STATIC_RENDER_WORKER`). Integrations still need
 * setup in this isolate before route renderers are created.
 */
async function initializeWorker(configModulePath: string, runtimeOrigin: string): Promise<void> {
	appConfig = await loadEcoPagesConfig({ configFile: configModulePath });
	const runtime = requireAppRuntime(appConfig);
	runtime.origin = runtimeOrigin;

	await setupAppRuntimePlugins({
		appConfig,
	});
	await setupAppRuntimeIntegrations({ appConfig });

	installBuildQueue(appConfig);

	routeRendererFactory = new RouteRendererFactory({
		appConfig,
	});
}

async function renderPage(filePath: string, params: PageParams, query?: PageQuery): Promise<LitStaticRenderResult> {
	if (!routeRendererFactory) {
		throw new Error('Lit static render worker is not initialized');
	}

	const result = await routeRendererFactory.getPageRenderer(filePath).execute({
		file: filePath,
		params,
		query,
	});

	return toLitStaticRenderResult(result);
}

async function shutdownWorker(): Promise<void> {
	shutdownRequested = true;
	if (activeRenders > 0) {
		await new Promise<void>((resolve) => {
			resolveRendersIdle = resolve;
		});
	}

	try {
		if (appConfig) {
			await teardownAppRuntimeIntegrations({ appConfig });
		}
		postMessage({ type: 'shutdown-complete' });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		postMessage({ type: 'error', message: errorMessage });
	} finally {
		parentPort?.close();
	}
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
			await shutdownWorker();
			return;
		}

		if (message.type === 'render') {
			if (shutdownRequested) {
				throw new Error('Lit static render worker is shutting down');
			}

			activeRenders += 1;
			try {
				const result = await renderPage(message.filePath, message.params, message.query);
				postMessage({ type: 'result', id: message.id, ...result });
			} finally {
				activeRenders -= 1;
				if (activeRenders === 0) {
					resolveRendersIdle?.();
					resolveRendersIdle = undefined;
				}
			}
		}
	} catch (error) {
		postMessage(toLitStaticRenderErrorMessage(error, message.type === 'render' ? message.id : undefined));
	}
});
