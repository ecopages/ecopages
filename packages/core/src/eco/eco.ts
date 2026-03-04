/**
 * The eco namespace - unified component and page factory API
 * @module
 */

import type {
	EcoComponent,
	EcoPagesElement,
	EcoPageComponent,
	GetMetadata,
	GetStaticPaths,
	GetStaticProps,
	Middleware,
	RequestLocals,
	RequestPageContext,
} from '../public-types.ts';
import type { CacheStrategy } from '../services/cache/cache.types.ts';
import type {
	ComponentOptions,
	Eco,
	PageOptions,
	PageOptionsBase,
	PagePropsFor,
	PagePropsForWithLocals,
	PageRequires,
} from './eco.types.ts';
import { createNodeId, createPropsRef, createSlotRef, getComponentRenderContext } from './component-render-context.ts';
import { createComponentMarker, parseComponentMarkers } from '../route-renderer/component-marker.ts';
import { addTriggerAttribute, isThenable, wrapWithScriptsInjector } from './eco.utils.ts';

/**
 * Creates a component factory with lazy-trigger support and cross-integration
 * marker emission for React boundaries.
 *
 * Behavior:
 * - In normal render flow, returns `options.render(props)` with optional lazy
 *   trigger/script wrapping.
 * - When rendering under component graph context and crossing from non-React
 *   integration into React, emits an `eco-marker` token instead of rendering
 *   the component immediately.
 *
 * @param options Component options for rendering and dependency declaration.
 * @returns Configured eco component.
 */
function createComponentFactory<P, E>(options: ComponentOptions<P, E>): EcoComponent<P, E> {
	const integrationName = options.integration ?? options.__eco?.integration;
	const comp: EcoComponent<P, E> = ((props: P) => {
		const renderContext = getComponentRenderContext();
		const shouldEmitMarker =
			renderContext !== undefined &&
			integrationName === 'react' &&
			Boolean(integrationName) &&
			renderContext.currentIntegration !== integrationName;

		if (shouldEmitMarker && renderContext) {
			const nodeId = createNodeId(renderContext);
			const propsRef = createPropsRef(renderContext);
			const componentRef = comp.config?.__eco?.id ?? comp.config?.__eco?.file;

			if (!componentRef) {
				throw new Error(
					'[ecopages] Missing component reference metadata for cross-integration marker emission.',
				);
			}

			const componentProps = (props ?? {}) as Record<string, unknown>;
			renderContext.propsByRef[propsRef] = componentProps;

			let slotRef: string | undefined;
			const children = componentProps.children;
			if (typeof children === 'string' && children.includes('<eco-marker')) {
				const childMarkers = parseComponentMarkers(children);
				if (childMarkers.length > 0) {
					slotRef = createSlotRef(renderContext);
					renderContext.slotChildrenByRef[slotRef] = childMarkers.map((marker) => marker.nodeId);
				}
			}

			return createComponentMarker({
				nodeId,
				integration: integrationName as string,
				componentRef,
				propsRef,
				slotRef,
			}) as E;
		}

		const content = options.render(props);

		const lazyTriggers = comp.config?._resolvedLazyTriggers;
		if (lazyTriggers && lazyTriggers.length > 0) {
			const triggerId = lazyTriggers[0].triggerId;
			if (isThenable(content)) {
				return content.then((resolvedContent) => addTriggerAttribute(resolvedContent, triggerId));
			}
			return addTriggerAttribute(content, triggerId);
		}

		const lazyGroups = comp.config?._resolvedLazyScripts;

		if (lazyGroups && lazyGroups.length > 0) {
			if (isThenable(content)) {
				return content.then((resolvedContent) => wrapWithScriptsInjector(resolvedContent, lazyGroups));
			}
			return wrapWithScriptsInjector(content, lazyGroups);
		}

		return content;
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
	page,
	metadata,
	staticPaths,
	staticProps,
};
