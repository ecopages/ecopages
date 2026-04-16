/**
 * The eco namespace - unified component and page factory API
 * @module
 */

import type {
	EcoComponent,
	EcoHtmlComponent,
	EcoLayoutComponent,
	EcoPagesElement,
	EcoPageComponent,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	Middleware,
	RequestLocals,
	RequestPageContext,
} from '../types/public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';
import type {
	ComponentOptions,
	Eco,
	HtmlOptions,
	LayoutOptions,
	PageOptions,
	PageOptionsBase,
	PagePropsFor,
	PagePropsForWithLocals,
	PageRequires,
} from './eco.types.ts';
import {
	finalizeComponentRender,
	interceptComponentBoundary,
} from '../route-renderer/orchestration/component-render-context.ts';
import { isThenable } from '../route-renderer/orchestration/render-output.utils.ts';

/**
 * Creates a component factory with lazy-trigger support and boundary-runtime
 * interception.
 *
 * Behavior:
 * - In normal render flow, returns `options.render(props)` with optional lazy
 *   trigger/script wrapping.
 * - When rendering under an active component boundary runtime and the current
 *   renderer-owned boundary runtime resolves the boundary immediately, returns
 *   that resolved output instead of rendering the component inline.
 *
 * @param options Component options for rendering and dependency declaration.
 * @returns Configured eco component.
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const integrationName = options.integration ?? options.__eco?.integration;
	const comp: EcoComponent<P, E> = ((props: P) => {
		const componentProps = (props ?? {}) as Record<string, unknown>;
		const renderInline = () => finalizeComponentRender(comp, options.render(props)) as E;
		const boundaryRender = interceptComponentBoundary({
			component: comp,
			props: componentProps,
			targetIntegration: integrationName,
		});

		if (isThenable<unknown | undefined>(boundaryRender)) {
			return boundaryRender.then((resolvedBoundaryRender) =>
				resolvedBoundaryRender !== undefined ? (resolvedBoundaryRender as E) : renderInline(),
			) as E;
		}

		if (boundaryRender !== undefined) {
			return boundaryRender as E;
		}

		return renderInline();
	}) as EcoComponent<P, E>;

	comp.config = {
		__eco: options.__eco,
		integration: options.integration,
		dependencies: options.dependencies,
	};

	return comp;
}

/**
 * Creates a reusable component with optional dependencies.
 *
 * @param options Component definition options.
 * @returns Eco component function.
 */
function component<P = {}, E = EcoPagesElement>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	return createComponentFactory(options);
}

/**
 * Creates a document shell component.
 *
 * Phase 1 keeps this as a semantic alias over eco.component() so existing
 * renderer behavior remains unchanged.
 */
function html<E = EcoPagesElement>(options: HtmlOptions<E>): EcoHtmlComponent<E> {
	return createComponentFactory(options) as EcoHtmlComponent<E>;
}

/**
 * Creates a route layout component.
 *
 * Phase 1 keeps this as a semantic alias over eco.component() so existing
 * renderer behavior remains unchanged.
 */
function layout<E = EcoPagesElement>(options: LayoutOptions<E>): EcoLayoutComponent<E> {
	return createComponentFactory(options) as EcoLayoutComponent<E>;
}

/**
 * Creates a page component with typed props and optional static helpers.
 */
function page<T = {}, E = EcoPagesElement>(options: PageOptions<T, E> & { requires?: undefined }): EcoPageComponent<T>;
function page<T = {}, E = EcoPagesElement, const K extends keyof RequestLocals = keyof RequestLocals>(
	options: Omit<PageOptions<T, E>, 'render' | 'requires'> & {
		requires: PageRequires<K>;
		render: (props: PagePropsForWithLocals<T, K>) => E | Promise<E>;
	},
): EcoPageComponent<T>;

/**
 * Creates a page component and attaches optional static APIs.
 *
 * @param options Page options.
 * @returns Eco page component.
 */
function page<T, E>(
	options: PageOptionsBase<T, E> & { cache?: CacheStrategy; middleware?: Middleware[] },
): EcoPageComponent<T> {
	const { layout, dependencies, render, staticPaths, staticProps, metadata, cache, requires, middleware } = options;

	const componentOptions: ComponentOptions<PagePropsFor<T> & Partial<RequestPageContext>, E> = {
		__eco: options.__eco,
		integration: options.integration,
		dependencies: layout
			? {
					...dependencies,
					components: [...(dependencies?.components || []), layout],
				}
			: dependencies,
		render,
	};

	const pageComponent = createComponentFactory(componentOptions) as EcoPageComponent<T>;

	if (layout && pageComponent.config) {
		pageComponent.config.layout = layout;
	}

	if (staticPaths) pageComponent.staticPaths = staticPaths;
	if (staticProps) pageComponent.staticProps = staticProps;
	if (metadata) pageComponent.metadata = metadata;
	if (cache) pageComponent.cache = cache;
	if (requires) pageComponent.requires = requires;
	if (middleware) pageComponent.middleware = middleware;

	return pageComponent;
}

/**
 * Type-safe wrapper for metadata functions.
 *
 * @param fn Metadata factory function.
 * @returns The same function.
 */
function metadata<P = {}>(fn: GetMetadata<P>): GetMetadata<P> {
	return fn;
}

/**
 * Type-safe wrapper for static paths functions.
 *
 * @param fn Static paths function.
 * @returns The same function.
 */
function staticPaths(fn: GetStaticPaths): GetStaticPaths {
	return fn;
}

/**
 * Type-safe wrapper for static props functions.
 *
 * @param fn Static props function.
 * @returns The same function.
 */
function staticProps<P>(fn: GetStaticProps<P>): GetStaticProps<P> {
	return fn;
}

/**
 * The eco namespace - provides factories for components and pages
 */
export const eco: Eco = {
	component,
	html,
	layout,
	page,
	metadata,
	staticPaths,
	staticProps,
};
