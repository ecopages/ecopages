import fs from 'node:fs';
import path from 'node:path';
import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import type { EcopagesVitePlugin } from '../types.ts';

function generateHandlerSource(appConfig: EcoPagesAppConfig): string {
	const ecoConfigPath = path.join(appConfig.rootDir, 'eco.config').replaceAll('\\', '/');
	const appEntryPath = path.join(appConfig.rootDir, 'app').replaceAll('\\', '/');

	return `
import { getViteEnvironmentHostModuleLoader } from '@ecopages/core/services/module-loading/vite-environment-host-module-loader.service';
import { normalizeHtmlResponse } from '@ecopages/vite-plugin/nitro/runtime';
import { defineHandler } from 'nitro';
import appConfig from '${ecoConfigPath}';

let appPromise;

function resolveRequestUrl(request) {
	if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
		return request.url;
	}

	const protocol = request.headers.get('x-forwarded-proto') ?? 'http';
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost';
	return new URL(request.url, protocol + '://' + host).toString();
}

async function createRuntimeRequest(request) {
	const init = {
		method: request.method,
		headers: new Headers(request.headers),
	};

	if (request.method !== 'GET' && request.method !== 'HEAD') {
		init.body = await request.clone().arrayBuffer();
		init.duplex = 'half';
	}

	return new Request(resolveRequestUrl(request), init);
}

async function getHostedApp() {
	process.env.ECOPAGES_INTERNAL_EMBEDDED_RUNTIME = 'true';
	appConfig.runtime = {
		...(appConfig.runtime ?? {}),
		hostModuleLoader: getViteEnvironmentHostModuleLoader(),
	};

	appPromise ??= import('${appEntryPath}').then((module) => module.app);
	return appPromise;
}

export default defineHandler(async (event) => {
	const response = await (await getHostedApp()).fetch(await createRuntimeRequest(event.req));
	const contentType = response.headers.get('content-type') ?? '';

	if (!contentType.includes('text/html')) {
		return response;
	}

	const normalizedBody = normalizeHtmlResponse(await response.text(), {
		injectViteClient: import.meta.dev,
	});

	return new Response(normalizedBody, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
});
`.trimStart();
}

/**
 * Writes a generated Nitro handler file and returns its path.
 *
 * The handler imports `eco.config` and `app` from the project root using
 * absolute paths derived from `appConfig.rootDir`, so every Ecopages app
 * gets a working Nitro handler without maintaining a local handler file.
 */
export function writeNitroHandler(appConfig: EcoPagesAppConfig): string {
	const outDir = path.join(appConfig.rootDir, '.eco', 'nitro');
	fs.mkdirSync(outDir, { recursive: true });
	const handlerPath = path.join(outDir, 'handler.ts');
	fs.writeFileSync(handlerPath, generateHandlerSource(appConfig));
	return handlerPath;
}
