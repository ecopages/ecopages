import type { IHmrManager } from '../../public-types';

const HMR_RUNTIME_IMPORT = "import '/_hmr_runtime.js'";
const HMR_RUNTIME_SCRIPT = `<script type="module">${HMR_RUNTIME_IMPORT};</script>`;

/**
 * Returns whether a response is HTML and therefore eligible for development HMR
 * runtime injection.
 */
export function isHtmlResponse(response: Response): boolean {
	const contentType = response.headers.get('Content-Type');
	return contentType !== null && contentType.startsWith('text/html');
}

/**
 * Returns whether HTML responses should receive the HMR runtime bootstrap.
 *
 * This is shared because filesystem page responses and adapter-level HTML
 * responses flow through different layers, but both need identical injection
 * behavior in watch mode.
 */
export function shouldInjectHmrHtmlResponse(watch: boolean, hmrManager?: Pick<IHmrManager, 'isEnabled'>): boolean {
	return watch && hmrManager?.isEnabled() === true;
}

/**
 * Injects the development HMR runtime script into an HTML response if it is not
 * already present.
 *
 * The check is intentionally idempotent because an HTML response can pass
 * through more than one development-layer wrapper before reaching the client.
 */
export async function injectHmrRuntimeIntoHtmlResponse(response: Response): Promise<Response> {
	const html = await response.text();
	if (html.includes(HMR_RUNTIME_IMPORT)) {
		return new Response(html, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	}

	const updatedHtml = html.replace(/<\/html>/i, `${HMR_RUNTIME_SCRIPT}</html>`);
	const headers = new Headers(response.headers);
	headers.delete('Content-Length');

	return new Response(updatedHtml, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
