/**
 * Type definitions for the eco namespace API
 * @module
 */

import type {
	DependencyLazyTrigger,
	EcoComponent,
	EcoComponentDependencies,
	EcoHtmlComponent,
	EcoPageLayouts,
	EcoPagesElement,
	EcoPageComponent,
	GetMetadata,
	GetPaths,
	GetProps,
	GetRequestProps,
	HtmlTemplateProps,
	LayoutBuildContext,
	LayoutProps,
	LayoutRequestContext,
	RequestLocals,
	RequestPageContext,
	PagePropsFor,
	PageRequires,
	PageDependenciesInput,
	DynamicPageDependenciesInput,
	StaticCacheStrategy,
} from './contracts.ts';
import type { ListLocals, MergeLocals, PageMiddlewareEntry } from './middleware-types.ts';
import type { ComponentIdentity } from './component-identity.ts';

export type {
	EcoPageComponent,
	FileOwnedDependencyContribution,
	GetPageDependencies,
	GetPageDependenciesContext,
	PageDependenciesInput,
	PageDependenciesResult,
	PagePropsFor,
	PageRequires,
} from './contracts.ts';

type RequiresKeys = keyof RequestLocals;

/**
 * Extracts the props type from one eco component.
 */
export type PropsOf<TComponent extends EcoComponent> = TComponent extends EcoComponent<infer P, any> ? P : never;

/**
 * Extracts the render result type from one eco component.
 */
export type ResultOf<TComponent extends EcoComponent> =
	CallableComponentOf<TComponent> extends (props: any, ...args: any[]) => infer R ? R : never;

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
export type ChildrenOf<TComponent extends EcoComponent> =
	PropsOf<TComponent> extends { children?: infer T }
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
	/** Bound by the component identity attribution transform. */
	identity?: ComponentIdentity;
	integration?: string;
	dependencies?: EcoComponentDependencies;
	render: (props: P) => E | Promise<E>;
}

export type HtmlOptions<E = EcoPagesElement> = ComponentOptions<HtmlTemplateProps<E>, E>;

/**
 * Options for `eco.layout()`.
 *
 * @remarks
 * `P` adds props to `LayoutProps`. Extra props must be optional for the layout to be accepted by
 * `eco.page({ layout })`, which passes only `LayoutProps` and the entry's props factory output.
 */
export type LayoutOptions<E = EcoPagesElement, P extends LayoutProps<E> = LayoutProps<E>> = ComponentOptions<P, E>;

/**
 * Base options shared by all page variants
 */
export interface PageOptionsBase<T, E = EcoPagesElement> {
	/** Bound by the component identity attribution transform. */
	identity?: ComponentIdentity;
	integration?: string;

	/**
	 * Lists the Params a dynamic route (e.g. `[slug].tsx`) is known for at build time, as `[{ params }]`.
	 *
	 * @remarks
	 * The Cache Strategy decides what the build does with each entry: `'static'` and `{ revalidate }` Pages render
	 * and write HTML for it, `'dynamic'` Pages plan a Page Browser Graph for it.
	 */
	paths?: GetPaths;

	/**
	 * Generate page metadata (title, description, etc.).
	 *
	 * @remarks
	 * Props come from `props`. Props passed into the render are overlaid
	 * and win when both set the same key. `metadata` sees the merged props.
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
 * Options of a Static or revalidating Page. No request exists when its `props` hook runs, so the hook receives the
 * build context and the Page takes no middleware.
 */
export interface StaticPageOptions<T, E = EcoPagesElement> extends PageOptionsBase<T, E> {
	/**
	 * Cache configuration for ISR (Incremental Static Regeneration).
	 * - `'static'`: Reuse until the next deploy (default); HTML is revalidated with ETag
	 * - `{ revalidate: number, tags?: string[] }`: Cache with time-based revalidation
	 */
	cache?: StaticCacheStrategy;
	middleware?: undefined;
	/**
	 * The layout tiers that wrap the Page, outer to inner.
	 *
	 * @remarks
	 * An entry's `props` factory receives the Params and no `locals`: no request exists when a Static or revalidating
	 * Page renders.
	 */
	layout?: EcoPageLayouts<E, LayoutBuildContext>;
	/**
	 * Returns the page's props object. Props are passed to both render() and metadata().
	 *
	 * @remarks
	 * Receives each Params entry of `paths` at build, and the Params of the page again when a revalidating Page
	 * regenerates.
	 */
	props?: GetProps<T>;
	/**
	 * Declares browser dependencies for the page, or resolves them per render after `props` are available.
	 */
	dependencies?: PageDependenciesInput<T>;
}

/**
 * Options of a Dynamic Page, rendered on every request.
 *
 * @typeParam TLocals - The Locals its `props` hook reads.
 */
export interface DynamicPageOptions<T, E = EcoPagesElement, TLocals = RequestLocals> extends PageOptionsBase<T, E> {
	/**
	 * No caching: render on every request. Middleware requires it, since caching would bypass middleware effects.
	 */
	cache: 'dynamic';
	/**
	 * The layout tiers that wrap the Page, outer to inner.
	 *
	 * @remarks
	 * An entry's `props` factory runs on the server for each request and reads the same `locals` as the `props`
	 * hook. What it returns reaches the browser for hydration.
	 */
	layout?: EcoPageLayouts<E, LayoutRequestContext<TLocals>>;
	/**
	 * Request-time middleware for file-based routes.
	 * Runs before rendering and can short-circuit by returning a Response.
	 */
	middleware?: readonly PageMiddlewareEntry[];
	/**
	 * The Page's request handler: it receives the request, its Params and Query, and the Locals its middleware
	 * provided, and returns the props `render` and `metadata` receive.
	 *
	 * @remarks
	 * It runs on every request and never at build. For a hydrated Page what it returns reaches the browser, so it
	 * returns only what the browser may see.
	 */
	props?: GetRequestProps<T, TLocals>;
	/**
	 * Declares browser dependencies for the page, or resolves them from Params and Query.
	 *
	 * @remarks
	 * The resolver receives no `props`: the build plans the Page once per `paths` entry without running `props`.
	 */
	dependencies?: DynamicPageDependenciesInput;
}

type TypedLocals<M extends readonly PageMiddlewareEntry[], K extends RequiresKeys> = MergeLocals<
	WithRequiredLocals<K>,
	ListLocals<M>
>;

/**
 * Page options with a `middleware` list whose locals type `locals` in `props` and `render`.
 *
 * @remarks
 * `locals` starts from the global `RequestLocals`, narrows the keys the page lists in `requires` to non-null, and
 * then takes what the list provides on top, a later entry overriding an earlier one. `requires` also keeps its
 * meaning of which locals reach the browser for hydration.
 */
export type PageOptionsWithTypedLocals<
	T,
	E,
	M extends readonly PageMiddlewareEntry[],
	K extends RequiresKeys = never,
> = Omit<DynamicPageOptions<T, E, TypedLocals<M, K>>, 'render' | 'middleware' | 'requires'> & {
	requires?: PageRequires<K>;
	middleware: M;
	render: (
		props: PagePropsFor<T> &
			Omit<Partial<RequestPageContext>, 'locals'> & {
				locals: TypedLocals<M, K>;
			},
	) => E | Promise<E>;
};

/**
 * Options for creating a page with eco.page()
 *
 * Define paths, props, and metadata inline. When using
 * `middleware`, `cache` must be set to `'dynamic'` because middleware
 * runs on every request and caching would bypass middleware effects.
 * A Dynamic Page's `props` receives the request; a Static or revalidating Page's `props` receives only the build
 * context.
 *
 * @template T - The props type for the page
 * @template E - The element/return type (defaults to EcoPagesElement for Kita, use ReactNode for React)
 */
export type PageOptions<T, E = EcoPagesElement> = StaticPageOptions<T, E> | DynamicPageOptions<T, E>;

type WithRequiresRender<O, T, E, K extends RequiresKeys> = Omit<O, 'render' | 'requires'> & {
	requires: PageRequires<K>;
	render: (props: PagePropsForWithLocals<T, K>) => E | Promise<E>;
};

/**
 * Options of a Static or revalidating Page that declares `requires`, whose `render` reads the required keys as
 * non-null.
 */
export type StaticPageOptionsWithRequires<T, E, K extends RequiresKeys> = WithRequiresRender<
	StaticPageOptions<T, E>,
	T,
	E,
	K
>;

/**
 * Options of a Dynamic Page that declares `requires`, whose `props` and `render` read the required keys as non-null.
 */
export type DynamicPageOptionsWithRequires<T, E, K extends RequiresKeys> = WithRequiresRender<
	DynamicPageOptions<T, E, WithRequiredLocals<K>>,
	T,
	E,
	K
>;

export type PagePropsForWithLocals<T, K extends keyof RequestLocals | never = never> = PagePropsFor<T> &
	(K extends never
		? Partial<RequestPageContext>
		: Omit<Partial<RequestPageContext>, 'locals'> & {
				locals: WithRequiredLocals<Extract<K, keyof RequestLocals>>;
			});

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
	layout: <E = EcoPagesElement, P extends LayoutProps<E> = LayoutProps<E>>(
		options: LayoutOptions<E, P>,
	) => EcoComponent<P, E>;

	/**
	 * Create a page component with type-safe props from `props`.
	 * Returns an EcoPageComponent with attached paths, props, and metadata.
	 *
	 * If `requires` is provided, the `render` callback receives `locals` as required and non-null for the required keys.
	 */
	page: {
		<
			T = {},
			E = EcoPagesElement,
			const M extends readonly PageMiddlewareEntry[] = readonly PageMiddlewareEntry[],
			const K extends RequiresKeys = never,
		>(
			options: PageOptionsWithTypedLocals<T, E, M, K>,
		): EcoPageComponent<T>;
		<T = {}, E = EcoPagesElement>(options: StaticPageOptions<T, E> & { requires?: undefined }): EcoPageComponent<T>;
		<T = {}, E = EcoPagesElement>(
			options: DynamicPageOptions<T, E> & { requires?: undefined },
		): EcoPageComponent<T>;
		<T = {}, E = EcoPagesElement, const K extends RequiresKeys = never>(
			options: DynamicPageOptionsWithRequires<T, E, K>,
		): EcoPageComponent<T>;
		<T = {}, E = EcoPagesElement, const K extends RequiresKeys = never>(
			options: StaticPageOptionsWithRequires<T, E, K>,
		): EcoPageComponent<T>;
	};
}
