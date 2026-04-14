import type { EcoComponent } from '../../types/public-types.ts';
import type { MarkerNodeId } from '../component-graph/component-marker.ts';
import { createComponentMarker, parseComponentMarkers } from '../component-graph/component-marker.ts';
import { getComponentReference } from '../component-graph/component-reference.ts';
import { addTriggerAttribute, isThenable, wrapWithScriptsInjector } from './render-output.utils.ts';

/**
 * Outcome returned by boundary policy during one component render pass.
 *
 * - `inline`: render the target component immediately in the current pass
 * - `defer`: emit an `eco-marker` and resolve it during the marker graph phase
 */
export type BoundaryRenderMode = 'inline' | 'defer';

/**
 * Input provided to boundary policy when a component boundary is reached.
 *
 * This keeps `eco.component()` decoupled from concrete integration/plugin
 * objects while still giving policy enough information to decide whether the
 * boundary should render immediately or be deferred.
 */
export type BoundaryRenderDecisionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
};

/**
 * Narrow render-pass facade used by `eco.component()` for boundary decisions.
 *
 * The boundary context is intentionally small so component rendering can remain
 * unaware of integration registries, plugin instances, or renderer lifecycles.
 */
export type ComponentRenderBoundaryContext = {
	/**
	 * Decides whether the next component boundary should render inline or defer to
	 * the marker graph stage.
	 *
	 * @param input Boundary metadata for the current render pass.
	 * @returns Boundary rendering mode for the target component.
	 */
	decideBoundaryRender(input: BoundaryRenderDecisionInput): BoundaryRenderMode;
};

/**
 * Integration-owned hook for serializing framework-specific deferred child payloads.
 *
 * Core handles primitive values, generic template transport shapes, and node-like
 * objects directly. Integrations can provide this callback to teach the boundary
 * runtime about richer payloads such as framework template sentinels that should
 * survive marker deferral as HTML rather than as opaque objects.
 *
 * Returning `undefined` tells core that the value is not recognized by the
 * integration-specific serializer.
 */
type DeferredValueSerializer = (
	value: unknown,
	serializeValue: (value: unknown) => string | undefined,
) => string | undefined;

/**
 * Minimal boundary payload needed to emit one deferred marker.
 *
 * The props object is captured into the graph context so the later marker-graph
 * resolution pass can reconstruct the original component invocation outside the
 * current integration's render stack.
 */
type DeferredBoundaryRenderInput = {
	component: EcoComponent;
	props: Record<string, unknown>;
	targetIntegration?: string;
};

/**
 * DOM-like shape that can be serialized without importing a concrete DOM type.
 *
 * Mixed-integration boundaries sometimes pass SSR-produced node-like structures
 * rather than plain strings. Core recognizes only the small subset needed to
 * recover HTML or text content during deferred child capture.
 */
type MarkerSerializableNodeLike = {
	nodeType: number;
	outerHTML?: string;
	textContent?: string | null;
	childNodes?: readonly MarkerSerializableNodeLike[];
};

/**
 * Detects node-like values that can be flattened into deferred HTML.
 */
function isMarkerSerializableNodeLike(value: unknown): value is MarkerSerializableNodeLike {
	return typeof value === 'object' && value !== null && 'nodeType' in value;
}

/**
 * Serializes a minimal DOM-like payload into HTML or text.
 *
 * Element-like payloads prefer `outerHTML` when present; text nodes prefer
 * `textContent`; other node containers recurse through `childNodes`.
 */
function serializeDeferredNodeLike(node: MarkerSerializableNodeLike): string | undefined {
	if (typeof node.outerHTML === 'string') {
		return node.outerHTML;
	}

	if (node.nodeType === 3) {
		return node.textContent ?? '';
	}

	if (Array.isArray(node.childNodes)) {
		return node.childNodes.map((child) => serializeDeferredNodeLike(child) ?? '').join('');
	}

	return node.textContent ?? undefined;
}

/**
 * Converts deferred child payloads into the string form stored in graph context.
 *
 * Core accepts primitives, arrays, and DOM-like payloads directly. Anything
 * richer must be recognized by the integration-owned `serializeDeferredValue`
 * callback; arbitrary plain objects are otherwise preserved as-is by the caller
 * instead of being flattened heuristically.
 */
function serializeDeferredChildren(
	value: unknown,
	seen = new Set<object>(),
	serializeDeferredValue?: DeferredValueSerializer,
): string | undefined {
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
		return value.map((item) => serializeDeferredChildren(item, seen, serializeDeferredValue) ?? '').join('');
	}

	if (isMarkerSerializableNodeLike(value)) {
		return serializeDeferredNodeLike(value);
	}

	if (serializeDeferredValue) {
		const serializedTemplate = serializeDeferredValue(value, (templateValue) =>
			serializeDeferredChildren(templateValue, seen, serializeDeferredValue),
		);

		if (serializedTemplate !== undefined) {
			return serializedTemplate;
		}
	}

	return undefined;
}

/**
 * Shared output finalization behavior used both inside and outside active render contexts.
 *
 * This stage is responsible only for lazy trigger or injector wrapping. Boundary
 * deferral stays in `ContextualComponentRenderRuntime`, which requires access to
 * per-render graph state.
 */
class ComponentRenderOutputRuntime {
	finalizeComponentRender<T>(component: EcoComponent, content: T): T {
		const lazyTriggers = component.config?._resolvedLazyTriggers;
		if (lazyTriggers && lazyTriggers.length > 0) {
			return this.addTriggerToContent(content, lazyTriggers[0].triggerId) as T;
		}

		const lazyGroups = component.config?._resolvedLazyScripts;
		if (lazyGroups && lazyGroups.length > 0) {
			return this.wrapContentWithScriptsInjector(content, lazyGroups) as T;
		}

		return content;
	}

	private addTriggerToContent(content: unknown, triggerId: string): unknown {
		if (isThenable(content)) {
			return content.then((resolvedContent) => addTriggerAttribute(resolvedContent, triggerId));
		}

		return addTriggerAttribute(content, triggerId);
	}

	private wrapContentWithScriptsInjector(
		content: unknown,
		lazyGroups: NonNullable<EcoComponent['config']>['_resolvedLazyScripts'],
	): unknown {
		if (isThenable(content)) {
			return content.then((resolvedContent) => wrapWithScriptsInjector(resolvedContent, lazyGroups));
		}

		return wrapWithScriptsInjector(content, lazyGroups);
	}
}

/**
 * Render-context-aware runtime that captures deferred boundary metadata.
 *
 * When boundary policy chooses `defer`, this runtime stores props and child-slot
 * references into the current graph context and returns an `eco-marker` placeholder
 * for later marker-graph resolution.
 */
class ContextualComponentRenderRuntime extends ComponentRenderOutputRuntime {
	private readonly context: ComponentRenderContext;

	constructor(context: ComponentRenderContext) {
		super();
		this.context = context;
	}

	/**
	 * Emits one deferred boundary marker when boundary policy selects `defer`.
	 *
	 * Serialized child HTML is stored in `propsByRef`. If that HTML already contains
	 * nested `eco-marker` nodes, their ids are also captured in `slotChildrenByRef`
	 * so the downstream graph resolver can stitch the correct resolved children back
	 * into the parent boundary.
	 */
	tryRenderDeferredBoundary<E>(input: DeferredBoundaryRenderInput): E | undefined {
		const shouldEmitMarker =
			this.context.boundaryContext.decideBoundaryRender({
				currentIntegration: this.context.currentIntegration,
				targetIntegration: input.targetIntegration,
				component: input.component,
			}) === 'defer';

		if (!shouldEmitMarker) {
			return undefined;
		}

		const nodeId = createNodeId(this.context);
		const propsRef = createPropsRef(this.context);
		const componentRef = getComponentReference(input.component);
		const storedProps = { ...input.props };
		const serializedChildren = serializeDeferredChildren(
			input.props.children,
			undefined,
			this.context.serializeDeferredValue,
		);

		this.context.propsByRef[propsRef] =
			serializedChildren === undefined ? storedProps : { ...storedProps, children: serializedChildren };

		let slotRef: string | undefined;
		if (typeof serializedChildren === 'string' && serializedChildren.includes('<eco-marker')) {
			const childMarkers = parseComponentMarkers(serializedChildren);
			if (childMarkers.length > 0) {
				slotRef = createSlotRef(this.context);
				this.context.slotChildrenByRef[slotRef] = childMarkers.map((marker) => marker.nodeId);
			}
		}

		return createComponentMarker({
			nodeId,
			integration: input.targetIntegration as string,
			componentRef,
			propsRef,
			slotRef,
		}) as E;
	}
}

/**
 * Per-render mutable state used while collecting marker graph references.
 *
 * Counters generate deterministic ids within one render execution.
 */
export type ComponentRenderContext = {
	currentIntegration: string;
	boundaryContext: ComponentRenderBoundaryContext;
	/** Optional integration-owned serializer for richer deferred child payloads. */
	serializeDeferredValue?: DeferredValueSerializer;
	/** Monotonic counter for stable marker node ids within one render pass. */
	nextNodeId: number;
	/** Monotonic counter for stable props references within one render pass. */
	nextPropsRefId: number;
	/** Monotonic counter for stable slot references within one render pass. */
	nextSlotRefId: number;
	/** Captured props for deferred boundaries, keyed by `propsRef`. */
	propsByRef: Record<string, Record<string, unknown>>;
	/** Nested child marker ids keyed by the parent boundary slot reference. */
	slotChildrenByRef: Record<string, MarkerNodeId[]>;
	tryRenderDeferredBoundary<E>(input: DeferredBoundaryRenderInput): E | undefined;
	finalizeComponentRender<T>(component: EcoComponent, content: T): T;
};

/**
 * Serializable graph context captured from one render execution.
 *
 * This payload is merged with explicit page-module graph context before marker
 * resolution in the route renderer.
 */
export type ComponentGraphContext = {
	/** Deferred boundary props keyed by marker `propsRef`. */
	propsByRef: Record<string, Record<string, unknown>>;
	/** Nested child marker ids keyed by marker `slotRef`. */
	slotChildrenByRef: Record<string, MarkerNodeId[]>;
};

/**
 * Minimal adapter over async-local storage used by the render-context runtime.
 *
 * Keeping this interface tiny makes the fallback stack implementation and the
 * Node `AsyncLocalStorage` implementation share the same calling code.
 */
type ContextStorage = {
	getStore(): ComponentRenderContext | undefined;
	run<T>(store: ComponentRenderContext, callback: () => Promise<T>): Promise<T>;
};

/**
 * Process-wide mutable state for component render contexts.
 *
 * Duplicate module instances can exist in development or mixed-runtime flows, so
 * this state is attached to a shared global scope instead of module-local state.
 */
type ComponentRenderContextState = {
	contextStack: ComponentRenderContext[];
	nodeContextStorage: ContextStorage | null;
	nodeContextStorageLoader: Promise<ContextStorage | null> | null;
};

const GLOBAL_COMPONENT_RENDER_CONTEXT_STATE_KEY = '__ECOPAGES_COMPONENT_RENDER_CONTEXT_STATE__';

/**
 * Chooses the widest shared global scope available for process-wide state.
 *
 * `process` is preferred when present so duplicate bundles or module instances in
 * the same runtime still converge on one shared context registry.
 */
function getSharedContextScope(): Record<string, unknown> {
	const globalProcess = globalThis.process as (NodeJS.Process & Record<string, unknown>) | undefined;
	if (globalProcess && typeof globalProcess === 'object') {
		return globalProcess;
	}

	return globalThis as Record<string, unknown>;
}

/**
 * Returns the singleton mutable state used by component render contexts.
 */
function getComponentRenderContextState(): ComponentRenderContextState {
	const sharedScope = getSharedContextScope() as typeof globalThis & {
		__ECOPAGES_COMPONENT_RENDER_CONTEXT_STATE__?: ComponentRenderContextState;
	};

	sharedScope[GLOBAL_COMPONENT_RENDER_CONTEXT_STATE_KEY] ??= {
		contextStack: [],
		nodeContextStorage: null,
		nodeContextStorageLoader: null,
	};

	return sharedScope[GLOBAL_COMPONENT_RENDER_CONTEXT_STATE_KEY];
}

/**
 * Lazily initializes async context storage for Node runtimes.
 *
 * Falls back to in-memory stack mode when async_hooks is unavailable.
 *
 * @returns Async context storage when available; otherwise `null`.
 */
async function getContextStorage(): Promise<ContextStorage | null> {
	const state = getComponentRenderContextState();

	if (state.nodeContextStorage) {
		return state.nodeContextStorage;
	}

	if (state.nodeContextStorageLoader) {
		return state.nodeContextStorageLoader;
	}

	state.nodeContextStorageLoader = import('node:async_hooks')
		.then((module) => {
			const storage = new module.AsyncLocalStorage<ComponentRenderContext>();
			state.nodeContextStorage = {
				getStore: () => storage.getStore(),
				run: (store, callback) => storage.run(store, callback),
			};
			return state.nodeContextStorage;
		})
		.catch(() => {
			state.nodeContextStorage = null;
			return null;
		})
		.finally(() => {
			state.nodeContextStorageLoader = null;
		});

	return state.nodeContextStorageLoader;
}

/**
 * Returns the current component render context, if one is active.
 *
 * @returns Active render context or `undefined` outside render execution.
 */
export function getComponentRenderContext(): ComponentRenderContext | undefined {
	const state = getComponentRenderContextState();
	return state.nodeContextStorage?.getStore() ?? state.contextStack[state.contextStack.length - 1];
}

/**
 * Allocates the next marker node id inside one render pass.
 */
function createNodeId(context: ComponentRenderContext): MarkerNodeId {
	context.nextNodeId += 1;
	return `n_${context.nextNodeId}`;
}

/**
 * Allocates the next props reference id inside one render pass.
 */
function createPropsRef(context: ComponentRenderContext): string {
	context.nextPropsRefId += 1;
	return `p_${context.nextPropsRefId}`;
}

/**
 * Allocates the next slot reference id inside one render pass.
 */
function createSlotRef(context: ComponentRenderContext): string {
	context.nextSlotRefId += 1;
	return `s_${context.nextSlotRefId}`;
}

const componentRenderOutputRuntime = new ComponentRenderOutputRuntime();

/**
 * Attempts to replace one component boundary with an `eco-marker` placeholder.
 *
 * Outside an active render context this is a no-op and returns `undefined`, which
 * lets the caller render inline instead.
 */
export function tryRenderDeferredBoundary<E>(input: DeferredBoundaryRenderInput): E | undefined {
	return getComponentRenderContext()?.tryRenderDeferredBoundary<E>(input);
}

/**
 * Applies lazy trigger or injector wrapping to completed component output.
 *
 * This helper works both inside render-context execution and in fallback flows
 * where no active context exists.
 */
export function finalizeComponentRender<T>(component: EcoComponent, content: T): T {
	const renderContext = getComponentRenderContext();
	return (renderContext?.finalizeComponentRender(component, content) ??
		componentRenderOutputRuntime.finalizeComponentRender(component, content)) as T;
}

/**
 * Runs render work under a fresh component render context and returns both:
 * - the render result value
 * - captured graph reference maps for downstream marker resolution
 *
 * @param input Execution metadata for current integration and boundary policy.
 * @param render Async render function to execute inside the context.
 * @returns Render result and captured graph context maps.
 */
export async function runWithComponentRenderContext<T>(
	input: {
		currentIntegration: string;
		boundaryContext: ComponentRenderBoundaryContext;
		serializeDeferredValue?: DeferredValueSerializer;
	},
	render: () => Promise<T>,
): Promise<{ value: T; graphContext: ComponentGraphContext }> {
	const context = {
		currentIntegration: input.currentIntegration,
		boundaryContext: input.boundaryContext,
		serializeDeferredValue: input.serializeDeferredValue,
		nextNodeId: 0,
		nextPropsRefId: 0,
		nextSlotRefId: 0,
		propsByRef: {},
		slotChildrenByRef: {},
	} as ComponentRenderContext;
	const runtime = new ContextualComponentRenderRuntime(context);
	context.tryRenderDeferredBoundary = <E>(deferredInput: DeferredBoundaryRenderInput) =>
		runtime.tryRenderDeferredBoundary<E>(deferredInput);
	context.finalizeComponentRender = <TContent>(component: EcoComponent, content: TContent) =>
		runtime.finalizeComponentRender(component, content);

	const storage = await getContextStorage();

	let value: T;
	if (storage) {
		value = await storage.run(context, render);
	} else {
		const state = getComponentRenderContextState();
		state.contextStack.push(context);
		try {
			value = await render();
		} finally {
			state.contextStack.pop();
		}
	}

	return {
		value,
		graphContext: {
			propsByRef: context.propsByRef,
			slotChildrenByRef: context.slotChildrenByRef,
		},
	};
}