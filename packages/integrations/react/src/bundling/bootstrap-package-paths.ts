/**
 * The packages React's generated browser entries import, in one place.
 *
 * @remarks
 * The Page and island entries import them by name, the development vendor graph builds them up front, and the
 * client-graph boundary keeps their imports in every client graph.
 */
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';

export const REACT_PACKAGE = 'react';
export const REACT_DOM_CLIENT_PACKAGE = 'react-dom/client';
export const PAGE_LAYOUT_NORMALIZATION_PACKAGE = '@ecopages/core/client';
export const LAYOUT_COMPOSE_PACKAGE = '@ecopages/react/layout-compose';
export const ISLAND_HYDRATION_PACKAGE = '@ecopages/react/island-hydration';
export const PAGE_HYDRATION_PACKAGE = '@ecopages/react/page-hydration';

/** React, React DOM and the JSX runtimes compiled React modules import. */
const REACT_RUNTIME_PACKAGES = [
	REACT_PACKAGE,
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	REACT_DOM_CLIENT_PACKAGE,
] as const;

/** Every package React's browser entries import, plus the configured router's browser entry. */
export function getReactBrowserPackages(routerAdapter?: ReactRouterAdapter): string[] {
	return [
		...REACT_RUNTIME_PACKAGES,
		PAGE_HYDRATION_PACKAGE,
		ISLAND_HYDRATION_PACKAGE,
		LAYOUT_COMPOSE_PACKAGE,
		PAGE_LAYOUT_NORMALIZATION_PACKAGE,
		...(routerAdapter ? [routerAdapter.importPath] : []),
	];
}
