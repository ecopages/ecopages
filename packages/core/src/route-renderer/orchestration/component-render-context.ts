import type { EcoComponent } from '../../types/public-types.ts';
import type { MarkerNodeId } from '../component-graph/component-marker.ts';
import { createComponentMarker } from '../component-graph/component-marker.ts';
import { getComponentReference } from '../component-graph/component-reference.ts';
import { addTriggerAttribute, isThenable, wrapWithScriptsInjector } from './render-output.utils.ts';

export type ComponentBoundaryInterceptionResult =
	| { kind: 'inline' }
	| { kind: 'placeholder' }
	| { kind: 'resolved'; value: unknown };

export type ComponentBoundaryInterceptionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
	props: Record<string, unknown>;
};

/**
 * Narrow boundary runtime injected into one active render context.
 */
export interface ComponentBoundaryRuntime {
	interceptBoundary?(
		input: ComponentBoundaryInterceptionInput,
	): ComponentBoundaryInterceptionResult | Promise<ComponentBoundaryInterceptionResult>;
	interceptBoundarySync?(input: ComponentBoundaryInterceptionInput): ComponentBoundaryInterceptionResult;
}

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
 * Minimal boundary payload needed to emit one deferred placeholder.
 *
 * The props object is captured into the boundary capture so the later deferred-
 * boundary resolution pass can reconstruct the original component invocation
 * outside the current integration's render stack.
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
 * Converts deferred child payloads into the string form stored in boundary capture.
 *
 * Core accepts primitives, arrays, and DOM-like payloads directly. Anything
 * richer must be recognized by the integration-owned `serializeDeferredValue`
 * callback; arbitrary plain objects are otherwise preserved as-is by the caller
 * instead of being flattened heuristically.
 */
function serializeDeferredChildren(
	value: unknown,
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
		return value.map((item) => serializeDeferredChildren(item, serializeDeferredValue) ?? '').join('');
	}

	if (isMarkerSerializableNodeLike(value)) {
		return serializeDeferredNodeLike(value);
	}

	if (serializeDeferredValue) {
		const serializedTemplate = serializeDeferredValue(value, (templateValue) =>
			serializeDeferredChildren(templateValue, serializeDeferredValue),
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
 * per-render boundary-capture state.
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
 * When the compatibility runtime requests placeholder emission, this runtime
 * stores props and deferred child payloads into the current boundary capture
 * state and returns an `eco-marker` placeholder for later deferred-boundary
 * resolution.
 */
class ContextualComponentRenderRuntime extends ComponentRenderOutputRuntime {
	private readonly context: ComponentRenderContext;

	constructor(context: ComponentRenderContext) {
		super();
		this.context = context;
	}

	private createDeferredBoundaryPlaceholder(input: DeferredBoundaryRenderInput): string {
		const nodeId = createNodeId(this.context);
		const propsRef = createPropsRef(this.context);
		const componentRef = getComponentReference(input.component);
		const storedProps = { ...input.props };
		const serializedChildren = serializeDeferredChildren(input.props.children, this.context.serializeDeferredValue);

		this.context.capturedPropsByRef[propsRef] =
			serializedChildren === undefined ? storedProps : { ...storedProps, children: serializedChildren };

		return createComponentMarker({
			nodeId,
			componentRef,
			propsRef,
		});
	}

	private applyBoundaryInterceptionResult(
		input: DeferredBoundaryRenderInput,
		result: ComponentBoundaryInterceptionResult,
	): unknown | undefined {
		if (result.kind === 'inline') {
			return undefined;
		}

		if (result.kind === 'resolved') {
			return result.value;
		}

		return this.createDeferredBoundaryPlaceholder(input);
	}

	/**
	 * Resolves one boundary interception through the active runtime.
	 *
	 * The runtime may choose inline rendering, immediate resolved output, or the
	 * legacy compatibility placeholder lane.
	 */
	interceptBoundary(input: DeferredBoundaryRenderInput): Promise<unknown | undefined> | unknown | undefined {
		const boundaryRuntimeInput = {
			currentIntegration: this.context.currentIntegration,
			targetIntegration: input.targetIntegration,
			component: input.component,
			props: input.props,
		} satisfies ComponentBoundaryInterceptionInput;

		const asyncInterception = this.context.boundaryRuntime?.interceptBoundary?.(boundaryRuntimeInput);
		if (asyncInterception !== undefined) {
			if (isThenable<ComponentBoundaryInterceptionResult>(asyncInterception)) {
				return asyncInterception.then((result) => this.applyBoundaryInterceptionResult(input, result));
			}

			return this.applyBoundaryInterceptionResult(input, asyncInterception);
		}

		const syncInterception = this.context.boundaryRuntime?.interceptBoundarySync?.(boundaryRuntimeInput);
		if (syncInterception === undefined) {
			return undefined;
		}

		return this.applyBoundaryInterceptionResult(input, syncInterception);
	}

	/**
	 * Emits one deferred boundary placeholder when the active runtime selects the
	 * compatibility lane through its synchronous interception hook.
	 */
	interceptBoundarySync(input: DeferredBoundaryRenderInput): unknown | undefined {
		const syncBoundaryResult = this.context.boundaryRuntime?.interceptBoundarySync?.({
			currentIntegration: this.context.currentIntegration,
			targetIntegration: input.targetIntegration,
			component: input.component,
			props: input.props,
		});

		if (!syncBoundaryResult) {
			return undefined;
		}

		return this.applyBoundaryInterceptionResult(input, syncBoundaryResult);
	}
}

/**
 * Serializable payload collected while a render pass records deferred boundaries.
 */
export type ComponentBoundaryCapture = {
	/** Captured props keyed by the generated placeholder props ref. */
	capturedPropsByRef: Record<string, Record<string, unknown>>;
};

/**
 * Per-render mutable state used while collecting deferred boundary capture.
 *
 * Counters generate deterministic ids within one render execution.
 */
export type ComponentRenderContext = {
	currentIntegration: string;
	boundaryRuntime?: ComponentBoundaryRuntime;
	/** Optional integration-owned serializer for richer deferred child payloads. */
	serializeDeferredValue?: DeferredValueSerializer;
	/** Monotonic counter for stable marker node ids within one render pass. */
	nextNodeId: number;
	/** Monotonic counter for stable props references within one render pass. */
	nextPropsRefId: number;
	/** Captured props for deferred boundaries, keyed by `propsRef`. */
	capturedPropsByRef: Record<string, Record<string, unknown>>;
	interceptBoundary(input: DeferredBoundaryRenderInput): Promise<unknown | undefined> | unknown | undefined;
	interceptBoundarySync(input: DeferredBoundaryRenderInput): unknown | undefined;
	finalizeComponentRender<T>(component: EcoComponent, content: T): T;
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

const componentRenderOutputRuntime = new ComponentRenderOutputRuntime();

/**
 * Runs synchronous compatibility interception for one component boundary.
 *
 * Outside an active render context this is a no-op and returns `undefined`, which
 * lets the caller render inline instead.
 */
export function interceptComponentBoundarySync(input: DeferredBoundaryRenderInput): string | undefined {
	return getComponentRenderContext()?.interceptBoundarySync(input) as string | undefined;
}

/**
 * Runs boundary interception for one component boundary.
 *
 * The active runtime may resolve the boundary immediately, keep it inline, or
 * fall back to the legacy placeholder compatibility lane.
 */
export function interceptComponentBoundary(
	input: DeferredBoundaryRenderInput,
): Promise<unknown | undefined> | unknown | undefined {
	return getComponentRenderContext()?.interceptBoundary(input);
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
 * - captured boundary state for downstream deferred-boundary resolution
 *
 * @param input Execution metadata for current integration and boundary policy.
 * @param render Async render function to execute inside the context.
 * @returns Render result and captured deferred-boundary state.
 */
export async function runWithComponentRenderContext<T>(
	input: {
		currentIntegration: string;
		boundaryRuntime?: ComponentBoundaryRuntime;
		serializeDeferredValue?: DeferredValueSerializer;
	},
	render: () => Promise<T>,
): Promise<{ value: T; boundaryCapture: ComponentBoundaryCapture }> {
	const context = {
		currentIntegration: input.currentIntegration,
		boundaryRuntime: input.boundaryRuntime,
		serializeDeferredValue: input.serializeDeferredValue,
		nextNodeId: 0,
		nextPropsRefId: 0,
		capturedPropsByRef: {},
	} as ComponentRenderContext;
	const runtime = new ContextualComponentRenderRuntime(context);
	context.interceptBoundary = (deferredInput: DeferredBoundaryRenderInput) =>
		runtime.interceptBoundary(deferredInput);
	context.interceptBoundarySync = (deferredInput: DeferredBoundaryRenderInput) =>
		runtime.interceptBoundarySync(deferredInput);
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
		boundaryCapture: {
			capturedPropsByRef: context.capturedPropsByRef,
		},
	};
}
