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
	FileRouteMiddleware,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
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
	getComponentRenderContext,
	interceptForeignChild,
} from '../route-renderer/orchestration/component-render-context.ts';
import { isThenable } from '../route-renderer/orchestration/render-output.utils.ts';

/**
 * Creates a component factory with lazy-trigger support and foreign-child-runtime
 * interception.
 *
 * Behavior:
 * - In normal render flow, returns `options.render(props)` with optional lazy
 *   trigger/script wrapping.
 * - When rendering under an active foreign-child runtime and the current
 *   renderer-owned foreign-child runtime resolves the foreign child immediately, returns
 *   that resolved output instead of rendering the component inline.
 *
 * @param options Component options for rendering and dependency declaration.
 * @returns Configured eco component.
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const integrationName = options.integration ?? options.__eco?.integration;
	const comp: EcoComponent<P, E> = ((props: P) => {
		const componentProps = (props ?? {}) as Record<string, unknown>;
		const renderInline = (nextProps: P = props) => finalizeComponentRender(comp, options.render(nextProps)) as E;
		const activeRenderContext = getComponentRenderContext();
		const foreignChildRender = interceptForeignChild({
			component: comp,
			props: componentProps,
			targetIntegration: integrationName,
		});

		if (isThenable<unknown | undefined>(foreignChildRender)) {
			return foreignChildRender.then((resolvedForeignChildRender) => {
				if (resolvedForeignChildRender?.kind === 'resolved') {
					return resolvedForeignChildRender.value as E;
				}

				return renderInline((resolvedForeignChildRender?.props ?? props) as P);
			}) as E;
		}

		if (foreignChildRender?.kind === 'resolved') {
			return foreignChildRender.value as E;
		}

		if (foreignChildRender?.kind === 'inline') {
			return renderInline((foreignChildRender.props ?? props) as P);
		}

		if (
			activeRenderContext &&
			activeRenderContext.foreignChildRuntime &&
			integrationName &&
			integrationName !== activeRenderContext.currentIntegration
		) {
			throw new Error(
				`[ecopages] Missing foreign-child interception from ${activeRenderContext.currentIntegration} to ${integrationName} for ${options.__eco?.file ?? 'unknown component'}.`,
			);
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

type CallableEcoComponent<P = Record<string, unknown>, R = unknown> = (props: P, ...args: any[]) => R;

function isMissingForeignChildInterceptionError(error: unknown): error is Error {
	return error instanceof Error && error.message.startsWith('[ecopages] Missing foreign-child interception from ');
}

function embed<P, R>(component: CallableEcoComponent<P, R>, props: P): R;
function embed<P extends Record<string, unknown>, R>(component: CallableEcoComponent<P, R>, props: P, children: unknown): R;

/**
 * Renders a component explicitly and optionally injects `children` into the
 * props bag before invocation.
 */
function embed<P extends Record<string, unknown>, R>(
	component: CallableEcoComponent<P, R>,
	props: P,
	children?: unknown,
): R {
	const activeRenderContext = getComponentRenderContext();
	const ecoComponent = component as unknown as EcoComponent<P, R>;
	const targetIntegration = ecoComponent.config?.integration ?? ecoComponent.config?.__eco?.integration;
	const componentFile = ecoComponent.config?.__eco?.file ?? 'unknown component';
	const nextProps = (children === undefined ? props : { ...props, children }) as P;

	try {
		return component(nextProps);
	} catch (error) {
		if (!isMissingForeignChildInterceptionError(error)) {
			throw error;
		}

		throw new Error(
			`[ecopages] eco.embed() could not hand off the Foreign Child from ${activeRenderContext?.currentIntegration ?? 'unknown integration'} to ${targetIntegration ?? 'unknown integration'} for ${componentFile}. The active Integration renderer exposed a foreign-child runtime, but it did not intercept this cross-integration render. Ensure mixed-integration Page, Layout, Html, or Component renders install foreign-child handoff before calling eco.embed().`,
		);
	}
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
	options: PageOptionsBase<T, E> & { cache?: CacheStrategy; middleware?: FileRouteMiddleware[] },
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
	embed,
	html,
	layout,
	page,
	metadata,
	staticPaths,
	staticProps,
};
