/**
 * Resolves browser import paths for React page hydration bootstraps.
 *
 * @remarks
 * When `useBrowserRuntimeImports` is true, helpers and runtimes resolve to shared
 * `/assets/vendors/*.js` URLs so unbundled HMR bootstraps evaluate as native ESM.
 * When false, bare package names are emitted for the production page bundler.
 */

import { LAYOUT_COMPOSE_PACKAGE, PAGE_LAYOUT_NORMALIZATION_PACKAGE } from '../bundling/bootstrap-package-paths.ts';
import type { ReactRuntimeImports } from '../bundling/runtime-bundle.ts';

export type HydrationBootstrapImportPaths = {
	reactImportPath: string;
	reactDomClientImportPath: string;
	routerImportPath?: string;
	layoutComposeImportPath: string;
	pageLayoutNormalizationImportPath: string;
};

export type ResolveHydrationBootstrapImportsOptions = {
	useBrowserRuntimeImports: boolean;
	runtimeImports: ReactRuntimeImports;
	routerAdapterImportPath?: string;
};

/**
 * Returns import paths for React page hydration scripts.
 */
export function resolveHydrationBootstrapImports(
	options: ResolveHydrationBootstrapImportsOptions,
): HydrationBootstrapImportPaths {
	const { useBrowserRuntimeImports, runtimeImports, routerAdapterImportPath } = options;

	if (useBrowserRuntimeImports) {
		return {
			reactImportPath: runtimeImports.react,
			reactDomClientImportPath: runtimeImports.reactDomClient,
			...(runtimeImports.router || routerAdapterImportPath
				? { routerImportPath: runtimeImports.router ?? routerAdapterImportPath }
				: {}),
			layoutComposeImportPath: runtimeImports.layoutCompose,
			pageLayoutNormalizationImportPath: runtimeImports.pageLayoutNormalization,
		};
	}

	return {
		reactImportPath: 'react',
		reactDomClientImportPath: 'react-dom/client',
		...(routerAdapterImportPath ? { routerImportPath: routerAdapterImportPath } : {}),
		layoutComposeImportPath: LAYOUT_COMPOSE_PACKAGE,
		pageLayoutNormalizationImportPath: PAGE_LAYOUT_NORMALIZATION_PACKAGE,
	};
}
