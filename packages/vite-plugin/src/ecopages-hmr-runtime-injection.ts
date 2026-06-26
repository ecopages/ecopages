const ECOPAGES_HMR_RUNTIME_IMPORT = "import '/_hmr_runtime.js'";
const ECOPAGES_HMR_RUNTIME_SCRIPT = `<script type="module">${ECOPAGES_HMR_RUNTIME_IMPORT};</script>`;

/**
 * Injects the Ecopages HMR runtime bootstrap for embedded Vite document navigations.
 */
export function injectEcopagesHmrRuntimeIntoHtml(html: string): string {
	if (html.includes(ECOPAGES_HMR_RUNTIME_IMPORT)) {
		return html;
	}

	return html.replace(/<\/html>/i, `${ECOPAGES_HMR_RUNTIME_SCRIPT}</html>`);
}

/** Applies the embedded-host dev bootstrap to a Vite-transformed HTML document. */
export function injectEcopagesDocumentDevBootstrap(html: string): string {
	return injectEcopagesHmrRuntimeIntoHtml(html);
}

/** Removes Vite browser HMR client scripts when the host disables Vite HMR. */
export function stripViteBrowserHmrScripts(html: string): string {
	return html
		.replace(/<script type="module" src="\/@vite\/client"><\/script>\s*/gi, '')
		.replace(/<script type="module" src="\/@react-refresh"><\/script>\s*/gi, '');
}
