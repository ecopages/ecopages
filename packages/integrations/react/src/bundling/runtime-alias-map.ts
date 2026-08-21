import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import type { ReactRuntimeImports } from './runtime-bundle.ts';
import type { ResolvedReactPluginRuntimeModule } from './runtime-modules.ts';
import {
	createBrowserRuntimeManifest,
	type BrowserRuntimeAssetDeclaration,
	type BrowserRuntimeManifest,
} from '@ecopages/core/build/browser-runtime-manifest';
import { LAYOUT_COMPOSE_PACKAGE } from './bootstrap-package-paths.ts';

export type BuildReactRuntimeManifestOptions = {
	routerImportPath?: string;
};

export const REACT_RUNTIME_SPECIFIERS = [
	'react',
	'react-dom',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom/client',
] as const;

export function buildConfiguredRuntimeModuleManifestEntries(
	modules: readonly ResolvedReactPluginRuntimeModule[],
	getPublicPath: (outputName: string) => string,
): BrowserRuntimeAssetDeclaration[] {
	return modules.map((module) => ({
		specifier: module.specifier,
		owner: '@ecopages/react',
		importPath: module.specifier,
		publicPath: getPublicPath(module.outputName),
		externals: [...getReactRuntimeExternalSpecifiers(), ...module.externals],
	}));
}

export function buildReactRuntimeManifest(
	runtimeImports: ReactRuntimeImports,
	configuredRuntimeModules: readonly ResolvedReactPluginRuntimeModule[] = [],
	getConfiguredRuntimeModulePublicPath: (outputName: string) => string = () => '',
	options?: BuildReactRuntimeManifestOptions,
): BrowserRuntimeManifest {
	const frameworkDeclarations: BrowserRuntimeAssetDeclaration[] = [
		{
			specifier: LAYOUT_COMPOSE_PACKAGE,
			owner: '@ecopages/react',
			importPath: LAYOUT_COMPOSE_PACKAGE,
			publicPath: runtimeImports.layoutCompose,
		},
	];

	if (options?.routerImportPath && runtimeImports.router) {
		frameworkDeclarations.push(
			{
				specifier: options.routerImportPath,
				owner: '@ecopages/react-router',
				importPath: options.routerImportPath,
				publicPath: runtimeImports.router,
			},
			{
				specifier: '@ecopages/react-router',
				owner: '@ecopages/react-router',
				importPath: options.routerImportPath,
				publicPath: runtimeImports.router,
			},
		);
	}

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
		...frameworkDeclarations,
		...buildConfiguredRuntimeModuleManifestEntries(configuredRuntimeModules, getConfiguredRuntimeModulePublicPath),
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
