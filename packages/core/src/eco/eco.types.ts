/**
 * Type definitions for the eco namespace API
 * @module
 */

import type {
	EcoComponent,
	EcoComponentDependencies,
	EcoInjectedMeta,
	EcoPagesElement,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	Middleware,
	RequestLocals,
	RequestPageContext,
} from '../public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';

type WithRequiredLocals<K extends keyof RequestLocals> = Omit<RequestLocals, K> & {
	[P in K]-?: Exclude<RequestLocals[P], null | undefined>;
};

type RequiresKeys = keyof RequestLocals;

export type PageRequires<K extends RequiresKeys = RequiresKeys> = K | readonly K[];

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
	/** @internal Injected by eco-component-meta-plugin */
	__eco?: EcoInjectedMeta;
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
	/** @internal Injected by eco-component-meta-plugin */
	__eco?: EcoInjectedMeta;
	dependencies?: EcoComponentDependenciesWithLazy;
	layout?: EcoComponent<{ children: E } & Partial<RequestPageContext>>;

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

	/**
	 * Cache configuration for ISR (Incremental Static Regeneration).
	 * - `'static'`: Cache indefinitely (default)
	 * - `'dynamic'`: No caching, render on every request
	 * - `{ revalidate: number, tags?: string[] }`: Cache with time-based revalidation
	 */
	cache?: CacheStrategy;

	/**
	 * Declares which `locals` keys must be present for this page.
	 *
	 * This is a typing and documentation feature; runtime enforcement must be done via handler/page middleware.
	 */
	requires?: PageRequires;

	/**
	 * Request-time middleware for file-based routes.
	 * Runs before rendering and can short-circuit by returning a Response.
	 */
	middleware?: Middleware[];

	render: (props: PagePropsFor<T> & Partial<RequestPageContext>) => E | Promise<E>;
}

export type PagePropsForWithLocals<T, K extends RequiresKeys | never = never> = PagePropsFor<T> &
	(K extends never
		? Partial<RequestPageContext>
		: Omit<Partial<RequestPageContext>, 'locals'> & {
				locals: WithRequiredLocals<Extract<K, keyof RequestLocals>>;
			});

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
export type EcoPageComponent<T> = EcoComponent<PagePropsFor<T> & Partial<RequestPageContext>> & {
	staticPaths?: GetStaticPaths;
	staticProps?: GetStaticProps<T>;
	metadata?: GetMetadata<T>;
	cache?: CacheStrategy;
	requires?: PageRequires;
	middleware?: Middleware[];
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
	 *
	 * If `requires` is provided, the `render` callback receives `locals` as required and non-null for the required keys.
	 */
	page: {
		<T = {}, E = EcoPagesElement>(options: PageOptions<T, E> & { requires?: undefined }): EcoPageComponent<T>;
		<T = {}, E = EcoPagesElement, const K extends RequiresKeys = RequiresKeys>(
			options: Omit<PageOptions<T, E>, 'render' | 'requires'> & {
				requires: PageRequires<K>;
				render: (props: PagePropsForWithLocals<T, K>) => E | Promise<E>;
			},
		): EcoPageComponent<T>;
	};

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
