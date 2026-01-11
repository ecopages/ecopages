/**
 * Type definitions for the eco namespace API
 * @module
 */

import type {
	EcoComponent,
	EcoComponentDependencies,
	EcoPagesElement,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
} from '../public-types.ts';

/**
 * Lazy trigger options map directly to scripts-injector attributes.
 * Only one trigger type can be active at a time.
 */
export type LazyTrigger = { 'on:idle': true } | { 'on:interaction': string } | { 'on:visible': true | string };

/**
 * Lazy dependencies - scripts/stylesheets loaded on trigger.
 */
export type LazyDependencies = LazyTrigger & {
	scripts?: string[];
	stylesheets?: string[];
};

/**
 * Extended component dependencies that include lazy loading support.
 */
export type EcoComponentDependenciesWithLazy = EcoComponentDependencies & {
	lazy?: LazyDependencies;
};

/**
 * Options for creating a component with eco.component()
 */
export interface ComponentOptions<P> {
	dependencies?: EcoComponentDependenciesWithLazy;
	render: (props: P) => EcoPagesElement;
}

/**
 * Options for creating a page with eco.page()
 */
export interface PageOptions<T> {
	dependencies?: EcoComponentDependenciesWithLazy;
	render: (props: PagePropsFor<T>) => EcoPagesElement;
}

/**
 * Extracts props type from getStaticProps return type.
 * Falls back to empty params/query if no staticProps provided.
 */
export type PagePropsFor<T> =
	T extends GetStaticProps<infer P>
		? P & { params?: Record<string, string>; query?: Record<string, string> }
		: { params?: Record<string, string>; query?: Record<string, string> };

/**
 * The eco namespace interface
 */
export interface Eco {
	/**
	 * Create a reusable component with dependencies and optional lazy-loading
	 */
	component: <P = {}>(options: ComponentOptions<P>) => EcoComponent<P>;

	/**
	 * Create a page component with type-safe props from getStaticProps
	 */
	page: <T = {}>(options: PageOptions<T>) => EcoComponent<PagePropsFor<T>>;

	/**
	 * Type-safe wrapper for page metadata (identity function)
	 */
	metadata: <P = {}>(fn: GetMetadata<P>) => GetMetadata<P>;

	/**
	 * Type-safe wrapper for static paths (identity function)
	 */
	staticPaths: (fn: GetStaticPaths) => GetStaticPaths;

	/**
	 * Type-safe wrapper for static props (identity function)
	 */
	staticProps: <P>(fn: GetStaticProps<P>) => GetStaticProps<P>;
}
