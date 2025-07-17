import { type ComponentType, type LazyExoticComponent, lazy } from 'react';

/**
 * Dynamically loads a React component with optional SSR support.
 *
 * @param importFn - Function returning a promise that resolves to a React component.
 * @param options - Options for SSR behavior.
 * @returns Lazy loaded component or a null fallback for non-client environments.
 */
type DynamicLoaderOptions = {
	ssr?: boolean;
};

const NullComponent: ComponentType = () => null;

export function dynamic(
	importFn: () => Promise<{ default: ComponentType<any> }>,
	options: DynamicLoaderOptions = {},
): LazyExoticComponent<ComponentType<any>> | ComponentType {
	const { ssr = false } = options;

	if (ssr || typeof window !== 'undefined') {
		return lazy(importFn);
	}

	return NullComponent;
}
