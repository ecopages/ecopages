/**
 * Type definitions for the eco namespace API
 * @module
 */

import type {
	DependencyLazyTrigger,
	EcoComponent,
	EcoComponentDependencies,
	EcoHtmlComponent,
	EcoInjectedMeta,
	EcoLayoutComponent,
	EcoPageLayoutComponent,
	EcoPagesElement,
	FileRouteMiddleware,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	HtmlTemplateProps,
	LayoutProps,
	RequestLocals,
	RequestPageContext,
} from '../types/public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';

/**
 * Extracts the props type from one eco component.
 */
export type PropsOf<TComponent extends EcoComponent> = TComponent extends EcoComponent<infer P, any> ? P : never;

/**
 * Extracts the render result type from one eco component.
 */
export type ResultOf<TComponent extends EcoComponent> = TComponent extends EcoComponent<any, infer R> ? R : never;

/**
 * Narrows an eco component to its callable function signature.
 *
 * This is useful for helper modules such as `EcoEmbed` that invoke a component
 * directly and need to exclude the non-callable metadata shape from the public
 * type surface.
 */
export type CallableComponentOf<TComponent extends EcoComponent> = Extract<
	TComponent,
	(props: any, ...args: any[]) => any
>;

/**
 * Extracts the declared `children` type from one eco component when present.
 */
export type ChildrenOf<TComponent extends EcoComponent> = PropsOf<TComponent> extends { children?: infer T }
	? T
	: PropsOf<TComponent> extends { children: infer T }
		? T
		: never;

/**
 * Extracts the props accepted by `eco.embed()` before optional `children`
 * injection.
 *
 * When the target component already declares `children`, callers pass the rest
 * of the props bag here and provide `children` as the third `eco.embed()`
 * argument or the `EcoEmbed` wrapper children slot.
 */
export type EmbedPropsOf<TComponent extends EcoComponent> = 'children' extends keyof PropsOf<TComponent>
	? Omit<PropsOf<TComponent>, 'children'>
	: PropsOf<TComponent>;

/**
 * Props accepted by integration-owned `EcoEmbed` adapters.
 *
 * The `component` field is narrowed to the callable portion of the target eco
 * component so JSX wrappers can invoke `eco.embed()` without repeating local
 * callable-component extraction logic.
 */
export type EcoEmbedProps<TComponent extends EcoComponent> = {
	component: CallableComponentOf<TComponent>;
	props: EmbedPropsOf<TComponent>;
	children?: unknown;
};

type WithRequiredLocals<K extends keyof RequestLocals> = Omit<RequestLocals, K> & {
	[P in K]-?: Exclude<RequestLocals[P], null | undefined>;
};

type RequiresKeys = keyof RequestLocals;

export type PageRequires<K extends RequiresKeys = RequiresKeys> = K | readonly K[];

/**
 * Lazy trigger options map directly to scripts-injector attributes.
 * Only one trigger type can be active at a time.
 */
export type LazyTrigger = DependencyLazyTrigger;

/**
 * Options for creating a component with eco.component()
 * @template P - The props type for the component
 * @template E - The element/return type (defaults to EcoPagesElement for Kita, use ReactNode for React)
 */
export interface ComponentOptions<P, E = EcoPagesElement> {
	/** @internal Injected by eco-component-meta-plugin */
	__eco?: EcoInjectedMeta;
	integration?: string;
	dependencies?: EcoComponentDependencies;
	render: (props: P) => E | Promise<E>;
}

export type HtmlOptions<E = EcoPagesElement> = ComponentOptions<HtmlTemplateProps, E>;

export type LayoutOptions<E = EcoPagesElement> = ComponentOptions<LayoutProps<E>, E>;

/**
 * Base options shared by all page variants
 */
export interface PageOptionsBase<T, E = EcoPagesElement> {
	/** @internal Injected by eco-component-meta-plugin */
	__eco?: EcoInjectedMeta;
	integration?: string;
	dependencies?: EcoComponentDependencies;
	layout?: EcoPageLayoutComponent<E>;

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
	 * Declares which `locals` keys must be present for this page.
	 *
	 * This is a typing and documentation feature; runtime enforcement must be done via handler/page middleware.
	 */
	requires?: PageRequires;

	render: (props: PagePropsFor<T> & Partial<RequestPageContext>) => E | Promise<E>;
}

/**
 * Page options without middleware - allows any cache strategy
 */
interface PageOptionsWithoutMiddleware<T, E = EcoPagesElement> extends PageOptionsBase<T, E> {
	/**
	 * Cache configuration for ISR (Incremental Static Regeneration).
	 * - `'static'`: Cache indefinitely (default)
	 * - `'dynamic'`: No caching, render on every request
	 * - `{ revalidate: number, tags?: string[] }`: Cache with time-based revalidation
	 */
	cache?: CacheStrategy;
	middleware?: undefined;
}

/**
 * Page options with middleware - requires cache: 'dynamic'
 */
interface PageOptionsWithMiddleware<T, E = EcoPagesElement> extends PageOptionsBase<T, E> {
	/**
	 * Cache must be 'dynamic' when using middleware.
	 * Middleware runs on every request, so caching would bypass middleware effects.
	 */
	cache: 'dynamic';
	/**
	 * Request-time middleware for file-based routes.
	 * Runs before rendering and can short-circuit by returning a Response.
	 */
	middleware: FileRouteMiddleware[];
}

/**
 * Options for creating a page with eco.page()
 *
 * Supports two patterns:
 * 1. **Consolidated API** (recommended): Define staticPaths, staticProps, and metadata inline
 * 2. **Separate exports** (legacy): Export getStaticPaths, getStaticProps, getMetadata separately
 *
 * When using `middleware`, `cache` must be set to `'dynamic'` because middleware
 * runs on every request and caching would bypass middleware effects.
 *
 * @template T - The props type for the page
 * @template E - The element/return type (defaults to EcoPagesElement for Kita, use ReactNode for React)
 */
export type PageOptions<T, E = EcoPagesElement> = PageOptionsWithoutMiddleware<T, E> | PageOptionsWithMiddleware<T, E>;

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
	middleware?: FileRouteMiddleware[];
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
	 * Render a component explicitly, with an optional `children` argument.
	 *
	 * This is useful when authoring crosses integration boundaries and inline JSX
	 * would otherwise force one file to model multiple JSX namespaces.
	 */
	embed: {
		<TComponent extends EcoComponent>(
			component: CallableComponentOf<TComponent>,
			props: PropsOf<TComponent>,
		): ResultOf<TComponent>;
		<TComponent extends EcoComponent>(
			component: CallableComponentOf<TComponent>,
			props: EmbedPropsOf<TComponent>,
			children: ChildrenOf<TComponent> | unknown,
		): ResultOf<TComponent>;
	};

	/**
	 * Create a document shell component for the HTML wrapper.
	 */
	html: <E = EcoPagesElement>(options: HtmlOptions<E>) => EcoHtmlComponent<E>;

	/**
	 * Create a route layout component.
	 */
	layout: <E = EcoPagesElement>(options: LayoutOptions<E>) => EcoLayoutComponent<E>;

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
