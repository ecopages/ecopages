import type { ReactRouterAdapter } from '../router-adapter.ts';
import type { ReactRuntimeImports } from '../services/react-runtime-bundle.service.ts';

export const REACT_RUNTIME_SPECIFIERS = [
	'react',
	'react-dom',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom/client',
] as const;

export function buildReactRuntimeSpecifierMap(
	runtimeImports: ReactRuntimeImports,
	routerAdapter?: ReactRouterAdapter,
): Record<string, string> {
	const map: Record<string, string> = {
		react: runtimeImports.react,
		'react/jsx-runtime': runtimeImports.reactJsxRuntime,
		'react/jsx-dev-runtime': runtimeImports.reactJsxDevRuntime,
		'react-dom': runtimeImports.reactDom,
		'react-dom/client': runtimeImports.reactDomClient,
	};

	if (routerAdapter && runtimeImports.router) {
		map[routerAdapter.importMapKey] = runtimeImports.router;
	}

	return map;
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
		...(routerAdapter ? [routerAdapter.importMapKey] : []),
		...Array.from(runtimeSpecifiers),
	];
}
