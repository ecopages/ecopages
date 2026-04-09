import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin } from './types.ts';

/**
 * Overrides the JSX import source for non-host integration files when served
 * to the browser.
 *
 * Non-host integrations (Lit, KitaJS) compile JSX to HTML strings via their
 * own JSX runtimes. When those components are imported inside a host page and
 * the host framework calls their render function during hydration, the string
 * return value is rendered as a text node instead of a DOM element. Prepending
 * the host's JSX pragma before Vite's esbuild transform ensures the JSX
 * compiles to the host framework's element creation calls on the client,
 * producing proper elements that hydrate correctly against the SSR'd custom
 * elements.
 *
 * Server-side transforms (SSR) are left untouched so each integration keeps
 * its native JSX behaviour during rendering.
 */
export function ecopagesClientJsxCompat(api: EcopagesPluginApi): EcopagesVitePlugin {
	const hostIntegration = api.appConfig.integrations.find((integration) => integration.jsxImportSource);

	if (!hostIntegration?.jsxImportSource) {
		return {
			name: 'ecopages:client-jsx-compat',
		};
	}

	const pragma = `/** @jsxImportSource ${hostIntegration.jsxImportSource} */\n`;

	const nonHostExtensions = new Set(
		api.appConfig.integrations
			.filter((integration) => integration.name !== hostIntegration.name)
			.flatMap((integration) => integration.extensions),
	);

	function matchesNonHostExtension(id: string): boolean {
		for (const ext of nonHostExtensions) {
			if (id.endsWith(ext)) {
				return true;
			}
		}
		return false;
	}

	return {
		name: 'ecopages:client-jsx-compat',
		enforce: 'pre',
		transform(code, id, options) {
			if (options?.ssr) {
				return;
			}

			if (!matchesNonHostExtension(id)) {
				return;
			}

			if (code.includes('@jsxImportSource')) {
				return;
			}

			return pragma + code;
		},
	};
}
