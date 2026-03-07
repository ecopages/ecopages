import type { EcoComponent } from '../public-types.ts';
import type { MarkerNodeId } from '../route-renderer/component-marker.ts';

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
 * Per-render mutable state used while collecting marker graph references.
 *
 * Counters generate deterministic ids within one render execution.
 */
type ComponentRenderContext = {
	currentIntegration: string;
	boundaryContext: ComponentRenderBoundaryContext;
	nextNodeId: number;
	nextPropsRefId: number;
	nextSlotRefId: number;
	propsByRef: Record<string, Record<string, unknown>>;
	slotChildrenByRef: Record<string, MarkerNodeId[]>;
};

/**
 * Serializable graph context captured from one render execution.
 *
 * This payload is merged with explicit page-module graph context before marker
 * resolution in the route renderer.
 */
export type ComponentGraphContext = {
	propsByRef: Record<string, Record<string, unknown>>;
	slotChildrenByRef: Record<string, MarkerNodeId[]>;
};

type ContextStorage = {
	getStore(): ComponentRenderContext | undefined;
	run<T>(store: ComponentRenderContext, callback: () => Promise<T>): Promise<T>;
};

const contextStack: ComponentRenderContext[] = [];
let nodeContextStorage: ContextStorage | null = null;
let nodeContextStorageLoader: Promise<ContextStorage | null> | null = null;

/**
 * Lazily initializes async context storage for Node runtimes.
 *
 * Falls back to in-memory stack mode when async_hooks is unavailable.
 *
 * @returns Async context storage when available; otherwise `null`.
 */
async function getContextStorage(): Promise<ContextStorage | null> {
	if (nodeContextStorage) {
		return nodeContextStorage;
	}

	if (nodeContextStorageLoader) {
		return nodeContextStorageLoader;
	}

	nodeContextStorageLoader = import('node:async_hooks')
		.then((module) => {
			const storage = new module.AsyncLocalStorage<ComponentRenderContext>();
			nodeContextStorage = {
				getStore: () => storage.getStore(),
				run: (store, callback) => storage.run(store, callback),
			};
			return nodeContextStorage;
		})
		.catch(() => {
			nodeContextStorage = null;
			return null;
		})
		.finally(() => {
			nodeContextStorageLoader = null;
		});

	return nodeContextStorageLoader;
}

/**
 * Returns the current component render context, if one is active.
 *
 * @returns Active render context or `undefined` outside render execution.
 */
export function getComponentRenderContext(): ComponentRenderContext | undefined {
	return nodeContextStorage?.getStore() ?? contextStack[contextStack.length - 1];
}

/**
 * Allocates the next marker node id in the active render context.
 *
 * @param context Active render context.
 * @returns Stable marker node id for this render pass.
 */
export function createNodeId(context: ComponentRenderContext): MarkerNodeId {
	context.nextNodeId += 1;
	return `n_${context.nextNodeId}`;
}

/**
 * Allocates the next props reference id in the active render context.
 *
 * @param context Active render context.
 * @returns Props reference key.
 */
export function createPropsRef(context: ComponentRenderContext): string {
	context.nextPropsRefId += 1;
	return `p_${context.nextPropsRefId}`;
}

/**
 * Allocates the next slot reference id in the active render context.
 *
 * @param context Active render context.
 * @returns Slot reference key.
 */
export function createSlotRef(context: ComponentRenderContext): string {
	context.nextSlotRefId += 1;
	return `s_${context.nextSlotRefId}`;
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
	},
	render: () => Promise<T>,
): Promise<{ value: T; graphContext: ComponentGraphContext }> {
	const context: ComponentRenderContext = {
		currentIntegration: input.currentIntegration,
		boundaryContext: input.boundaryContext,
		nextNodeId: 0,
		nextPropsRefId: 0,
		nextSlotRefId: 0,
		propsByRef: {},
		slotChildrenByRef: {},
	};

	const storage = await getContextStorage();

	let value: T;
	if (storage) {
		value = await storage.run(context, render);
	} else {
		contextStack.push(context);
		try {
			value = await render();
		} finally {
			contextStack.pop();
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
