import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { DevToolbarHost, type DevToolbarHostOptions } from './dev-toolbar-host.ts';

export { DEV_TOOLBAR_RUNTIME_IMPORT } from './dev-toolbar-runtime-paths.ts';

/**
 * Returns whether HTML responses should receive the dev toolbar bootstrap.
 */
export function shouldInjectDevToolbarHtmlResponse(
	appConfig: EcoPagesAppConfig,
	options: DevToolbarHostOptions,
): boolean {
	return DevToolbarHost.forApp(appConfig, options).shouldInjectHtml();
}

/**
 * Injects the development dev toolbar runtime script into an HTML response if it is not already present.
 */
export async function injectDevToolbarIntoHtmlResponse(
	appConfig: EcoPagesAppConfig,
	options: DevToolbarHostOptions,
	response: Response,
): Promise<Response> {
	return DevToolbarHost.forApp(appConfig, options).injectHtmlResponse(response);
}
