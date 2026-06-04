import type { ReactRouterAdapter } from '../router-adapter.ts';
import type { ReactRuntimeImports } from '../services/react-runtime-bundle.service.ts';
import {
	createBrowserRuntimeManifest,
	getBrowserRuntimeSpecifierMap,
	type BrowserRuntimeManifest,
} from '@ecopages/core/build/browser-runtime-manifest';

export const REACT_RUNTIME_SPECIFIERS = [
	'react',
	'react-dom',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom/client',
] as const;

export function buildReactRuntimeAliasMap(runtimeImports: ReactRuntimeImports): Record<string, string> {
	return Object.fromEntries(getBrowserRuntimeSpecifierMap(buildReactRuntimeManifest(runtimeImports)));
}

export function buildReactRuntimeManifest(runtimeImports: ReactRuntimeImports): BrowserRuntimeManifest {
	return createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: runtimeImports.react,
		},
		{
			specifier: 'react/jsx-runtime',
			owner: '@ecopages/react',
			importPath: 'react/jsx-runtime',
			publicPath: runtimeImports.reactJsxRuntime,
		},
		{
			specifier: 'react/jsx-dev-runtime',
			owner: '@ecopages/react',
			importPath: 'react/jsx-dev-runtime',
			publicPath: runtimeImports.reactJsxDevRuntime,
		},
		{
			specifier: 'react-dom',
			owner: '@ecopages/react',
			importPath: 'react-dom',
			publicPath: runtimeImports.reactDom,
		},
		{
			specifier: 'react-dom/client',
			owner: '@ecopages/react',
			importPath: 'react-dom/client',
			publicPath: runtimeImports.reactDomClient,
		},
		{
			specifier: 'use-sync-external-store/shim',
			owner: '@ecopages/react',
			importPath: 'use-sync-external-store/shim',
			publicPath: runtimeImports.react,
		},
		{
			specifier: 'use-sync-external-store/shim/index.js',
			owner: '@ecopages/react',
			importPath: 'use-sync-external-store/shim/index.js',
			publicPath: runtimeImports.react,
		},
		{
			specifier: 'use-sync-external-store/shim/with-selector',
			owner: '@ecopages/react',
			importPath: 'use-sync-external-store/shim/with-selector',
			publicPath: runtimeImports.useSyncExternalStoreWithSelector,
		},
		{
			specifier: 'use-sync-external-store/shim/with-selector.js',
			owner: '@ecopages/react',
			importPath: 'use-sync-external-store/shim/with-selector.js',
			publicPath: runtimeImports.useSyncExternalStoreWithSelector,
		},
	]);
}

export function getReactRuntimeExternalSpecifiers(): string[] {
	return [...REACT_RUNTIME_SPECIFIERS];
}

export function getReactClientGraphAllowSpecifiers(
	runtimeSpecifiers: Iterable<string>,
	routerAdapter?: ReactRouterAdapter,
): string[] {
	return [
		'@ecopages/core',
		...REACT_RUNTIME_SPECIFIERS,
		...(routerAdapter ? [routerAdapter.bundle.importPath] : []),
		...Array.from(runtimeSpecifiers),
	];
}
