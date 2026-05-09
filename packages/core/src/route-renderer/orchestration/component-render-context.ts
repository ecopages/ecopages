import type { EcoComponent } from '../../types/public-types.ts';
import { addTriggerAttribute, isThenable, wrapWithScriptsInjector } from './render-output.utils.ts';

/**
 * Result returned by a renderer-owned foreign-child runtime.
 *
 * `inline` keeps rendering inside the current integration. `resolved` returns a
 * renderer-owned value immediately, which can be final HTML or a renderer-local
 * transport token for later queue resolution.
 */
export type ForeignChildInterceptionResult = { kind: 'inline' } | { kind: 'resolved'; value: unknown };

/**
 * Foreign-child metadata passed into the active renderer-owned runtime.
 */
export type ForeignChildInterceptionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
	props: Record<string, unknown>;
};

/**
 * Narrow renderer-owned foreign-child runtime injected into one active render
 * context.
 *
 * Integrations implement this contract when foreign children must be handed
 * off inside the renderer instead of being left for route-level reconciliation.
 */
export interface ForeignChildRuntime {
	/**
	 * Intercepts one foreign child during an active render.
	 *
	 * This runtime is typically installed by the Foreign Subtree execution module,
	 * which decides whether the child stays inline or leaves the current renderer.
	 */
	interceptForeignChild?(
		input: ForeignChildInterceptionInput,
	): ForeignChildInterceptionResult | Promise<ForeignChildInterceptionResult>;
	interceptForeignChildSync?(input: ForeignChildInterceptionInput): ForeignChildInterceptionResult;
}

type ForeignChildRenderInput = {
	component: EcoComponent;
	props: Record<string, unknown>;
	targetIntegration?: string;
};

/**
 * Shared output finalization behavior used both inside and outside active render contexts.
 *
 * This stage is responsible only for lazy trigger or injector wrapping. Foreign-child
 * interception stays in `ContextualComponentRenderRuntime`.
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
 * Render-context-aware runtime that delegates foreign-child interception.
 */
class ContextualComponentRenderRuntime extends ComponentRenderOutputRuntime {
	private readonly context: ComponentRenderContext;

	constructor(context: ComponentRenderContext) {
		super();
		this.context = context;
	}

	private applyForeignChildInterceptionResult(result: ForeignChildInterceptionResult): unknown | undefined {
		if (result.kind === 'resolved') {
			return result.value;
		}

		return undefined;
	}

	/**
	 * Resolves one foreign-child interception through the active runtime.
	 *
	 * The runtime may choose inline rendering or immediate resolved output.
	 */
	interceptForeignChild(input: ForeignChildRenderInput): Promise<unknown | undefined> | unknown | undefined {
		const foreignChildRuntimeInput = {
			currentIntegration: this.context.currentIntegration,
			targetIntegration: input.targetIntegration,
			component: input.component,
			props: input.props,
		} satisfies ForeignChildInterceptionInput;

		const asyncInterception = this.context.foreignChildRuntime?.interceptForeignChild?.(foreignChildRuntimeInput);
		if (asyncInterception !== undefined) {
			if (isThenable<ForeignChildInterceptionResult>(asyncInterception)) {
				return asyncInterception.then((result) => this.applyForeignChildInterceptionResult(result));
			}

			return this.applyForeignChildInterceptionResult(asyncInterception);
		}

		const syncInterception =
			this.context.foreignChildRuntime?.interceptForeignChildSync?.(foreignChildRuntimeInput);
		if (syncInterception === undefined) {
			return undefined;
		}

		return this.applyForeignChildInterceptionResult(syncInterception);
	}
}

/**
 * Per-render mutable state used while applying foreign-child interception and lazy
 * output wrapping.
 */
export type ComponentRenderContext = {
	currentIntegration: string;
	foreignChildRuntime?: ForeignChildRuntime;
	interceptForeignChild(input: ForeignChildRenderInput): Promise<unknown | undefined> | unknown | undefined;
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

const componentRenderOutputRuntime = new ComponentRenderOutputRuntime();

/**
 * Runs foreign-child interception for one component render step.
 *
 * The active runtime may resolve the foreign child immediately or keep it inline.
 */
export function interceptForeignChild(
	input: ForeignChildRenderInput,
): Promise<unknown | undefined> | unknown | undefined {
	return getComponentRenderContext()?.interceptForeignChild(input);
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
 * Runs render work under a fresh component render context and returns the
 * resulting value.
 *
 * @param input Execution metadata for current integration and foreign-child policy.
 * @param render Async render function to execute inside the context.
 * @returns Render result value.
 */
export async function runWithComponentRenderContext<T>(
	input: {
		currentIntegration: string;
		foreignChildRuntime?: ForeignChildRuntime;
	},
	render: () => Promise<T>,
): Promise<{ value: T }> {
	const context = {
		currentIntegration: input.currentIntegration,
		foreignChildRuntime: input.foreignChildRuntime,
	} as ComponentRenderContext;
	const runtime = new ContextualComponentRenderRuntime(context);
	context.interceptForeignChild = (deferredInput: ForeignChildRenderInput) =>
		runtime.interceptForeignChild(deferredInput);
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
	};
}
