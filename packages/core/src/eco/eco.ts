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
import { createNodeId, createPropsRef, createSlotRef, getComponentRenderContext } from './component-render-context.ts';
import { createComponentMarker, parseComponentMarkers } from '../route-renderer/component-graph/component-marker.ts';
import {
	getComponentReference,
	registerRuntimeComponentHint,
} from '../route-renderer/component-graph/component-reference.ts';
import { addTriggerAttribute, isThenable, wrapWithScriptsInjector } from './eco.utils.ts';

type MarkerSerializableTemplateLike = {
	strings: readonly string[];
	values?: readonly unknown[];
};

function isMarkerSerializableTemplateLike(value: unknown): value is MarkerSerializableTemplateLike {
	return (
		typeof value === 'object' &&
		value !== null &&
		Array.isArray((value as { strings?: unknown }).strings) &&
		((value as { values?: unknown }).values === undefined || Array.isArray((value as { values?: unknown }).values))
	);
}

function serializeDeferredChildren(value: unknown, seen = new Set<object>()): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number' || typeof value === 'bigint') {
		return String(value);
	}

	if (typeof value === 'boolean' || value == null) {
		return '';
	}

	if (Array.isArray(value)) {
		return value.map((item) => serializeDeferredChildren(item, seen) ?? '').join('');
	}

	if (isMarkerSerializableTemplateLike(value)) {
		const values = value.values ?? [];
		let html = '';

		for (let index = 0; index < value.strings.length; index += 1) {
			html += value.strings[index] ?? '';
			if (index < values.length) {
				html += serializeDeferredChildren(values[index], seen) ?? '';
			}
		}

		return html;
	}

	if (typeof value === 'object' && value !== null) {
		if (seen.has(value)) {
			return '';
		}

		seen.add(value);
		const serialized = Object.values(value as Record<string, unknown>)
			.map((entry) => serializeDeferredChildren(entry, seen) ?? '')
			.join('');
		seen.delete(value);

		return serialized.length > 0 ? serialized : undefined;
	}

	return undefined;
}

function getRuntimeComponentHint(render: unknown, options: ComponentOptions<unknown, unknown>): string | undefined {
	const stack = new Error().stack;
	if (stack) {
		for (const line of stack.split('\n').slice(1)) {
			const trimmed = line.trim();
			if (
				trimmed.includes('/packages/core/src/eco/eco.ts') ||
				trimmed.includes('createComponentFactory') ||
				trimmed.includes('component (') ||
				trimmed.includes('layout (') ||
				trimmed.includes('html (') ||
				trimmed.includes('page (')
			) {
				continue;
			}

			const match = trimmed.match(/(?:at\s+.*?\()?(.+?:\d+:\d+)\)?$/);
			if (match?.[1]) {
				return match[1];
			}
		}
	}

	const renderSignature = typeof render === 'function' ? render.toString() : undefined;
	if (!renderSignature) {
		return undefined;
	}

	return JSON.stringify({
		integration: options.integration,
		render: renderSignature,
		stylesheets: options.dependencies?.stylesheets,
		scripts: options.dependencies?.scripts,
	});
}

/**
 * Creates a component factory with lazy-trigger support and deferred-boundary
 * marker emission.
 *
 * Behavior:
 * - In normal render flow, returns `options.render(props)` with optional lazy
 *   trigger/script wrapping.
 * - When rendering under component graph context and the active boundary policy
 *   decides the target boundary should defer, emits an `eco-marker` token
 *   instead of rendering the component immediately.
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
			renderContext.boundaryContext.decideBoundaryRender({
				currentIntegration: renderContext.currentIntegration,
				targetIntegration: integrationName,
				component: comp,
			}) === 'defer';

		if (shouldEmitMarker && renderContext) {
			const nodeId = createNodeId(renderContext);
			const propsRef = createPropsRef(renderContext);
			const componentRef = getComponentReference(comp);

			const componentProps = (props ?? {}) as Record<string, unknown>;
			const storedProps = { ...componentProps };
			const serializedChildren = serializeDeferredChildren(componentProps.children);
			renderContext.propsByRef[propsRef] =
				serializedChildren === undefined ? storedProps : { ...storedProps, children: serializedChildren };

			let slotRef: string | undefined;
			if (typeof serializedChildren === 'string' && serializedChildren.includes('<eco-marker')) {
				const childMarkers = parseComponentMarkers(serializedChildren);
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

	const runtimeHint = getRuntimeComponentHint(options.render, options as ComponentOptions<unknown, unknown>);
	if (runtimeHint) {
		registerRuntimeComponentHint(comp, runtimeHint);
	}

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
