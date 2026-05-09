import type { ReactRouterAdapter } from '../router-adapter.ts';
import type { ReactRuntimeImports } from '../services/react-runtime-bundle.service.ts';

export const REACT_RUNTIME_SPECIFIERS = [
	'react',
	'react-dom',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom/client',
] as const;

export function buildReactRuntimeAliasMap(runtimeImports: ReactRuntimeImports): Record<string, string> {
	return {
		react: runtimeImports.react,
		'react/jsx-runtime': runtimeImports.reactJsxRuntime,
		'react/jsx-dev-runtime': runtimeImports.reactJsxDevRuntime,
		'react-dom': runtimeImports.reactDom,
		'react-dom/client': runtimeImports.reactDomClient,
	};
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
