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
