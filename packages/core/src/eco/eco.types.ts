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
 * @template P - The props type for the component
 * @template E - The element/return type (defaults to EcoPagesElement for Kita, use ReactNode for React)
 */
export interface ComponentOptions<P, E = EcoPagesElement> {
	/** Component directory for resolving relative dependencies. Auto-injected by plugin, or use `import.meta.dir` */
	componentDir?: string;
	dependencies?: EcoComponentDependenciesWithLazy;
	render: (props: P) => E | Promise<E>;
}

/**
 * Options for creating a page with eco.page()
 *
 * Supports two patterns:
 * 1. **Consolidated API** (recommended): Define staticPaths, staticProps, and metadata inline
 * 2. **Separate exports** (legacy): Export getStaticPaths, getStaticProps, getMetadata separately
 *
 * @template T - The props type for the page
 * @template E - The element/return type (defaults to EcoPagesElement for Kita, use ReactNode for React)
 */
export interface PageOptions<T, E = EcoPagesElement> {
	/** Component directory for resolving relative dependencies. Auto-injected by plugin, or use `import.meta.dir` */
	componentDir?: string;
	dependencies?: EcoComponentDependenciesWithLazy;
	layout?: EcoComponent<{ children: E }>;

	/**
	 * Define static paths for dynamic routes (e.g., [slug].tsx).
	 * Returns all possible paths that should be pre-rendered at build time.
	 */
	staticPaths?: GetStaticPaths;

	/**
	 * Fetch data for the page at build time.
	 * Props returned here are passed to both render() and metadata().
	 */
	staticProps?: GetStaticProps<T>;

	/**
	 * Generate page metadata (title, description, etc.).
	 * Receives props from staticProps if defined.
	 */
	metadata?: GetMetadata<T>;

	render: (props: PagePropsFor<T>) => E | Promise<E>;
}

/**
 * Extracts props type from getStaticProps return type, or uses T directly if it's a props object.
 * Always includes params and query for page context.
 */
export type PagePropsFor<T> =
	T extends GetStaticProps<infer P>
		? P & { params?: Record<string, string>; query?: Record<string, string> }
		: T & { params?: Record<string, string>; query?: Record<string, string> };

/**
 * A page component with optional attached static functions.
 * Used by the consolidated eco.page() API where staticPaths, staticProps,
 * and metadata are defined inline and attached to the component.
 */
export type EcoPageComponent<T> = EcoComponent<PagePropsFor<T>> & {
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;
};

/**
 * The eco namespace interface
 */
export interface Eco {
	/**
	 * Create a reusable component with dependencies and optional lazy-loading.
	 * @template P - Props type
	 * @template E - Element/return type (EcoPagesElement for Kita, ReactNode for React)
	 */
	component: <P = {}, E = EcoPagesElement>(options: ComponentOptions<P, E>) => EcoComponent<P, E>;

	/**
	 * Create a page component with type-safe props from getStaticProps.
	 * Returns an EcoPageComponent with attached staticPaths, staticProps, and metadata.
	 * @template T - Props type
	 * @template E - Element/return type (EcoPagesElement for Kita, ReactNode for React)
	 */
	page: <T = {}, E = EcoPagesElement>(options: PageOptions<T, E>) => EcoPageComponent<T>;

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
