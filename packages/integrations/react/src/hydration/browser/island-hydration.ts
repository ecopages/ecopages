/**
 * Browser-side React Island Host lifecycle.
 *
 * @remarks
 * This module intentionally receives React's browser runtime as a value. The
 * server entry compiler can therefore keep the application's React and
 * ReactDOM imports external while bundling this framework-owned lifecycle.
 */

export type IslandComponent = (props: Record<string, unknown>) => unknown;

export type IslandReactRuntime = {
	hydrateRoot: (
		target: HTMLElement,
		tree: unknown,
		options?: { onRecoverableError?: (error: unknown) => void },
	) => IslandRoot;
	createElement: (type: unknown, props: Record<string, unknown>) => unknown;
	useEffect: (effect: () => void, dependencies: unknown[]) => void;
};

export type IslandRoot = {
	render: (tree: unknown) => void;
	unmount: () => void;
};

type IslandRecord = {
	root: IslandRoot;
	hydrated: boolean;
	component: IslandComponent;
	pendingComponent?: IslandComponent;
};

type IslandHost = HTMLElement & { __eco_island?: IslandRecord };

/** Shared browser state for all Island Host entries on one document. */
export type IslandHydrationRuntime = {
	islandRoots: Record<string, IslandRoot>;
	islandComponents: Record<string, IslandComponent>;
	observer?: MutationObserver;
	/** Island entries by HMR module path, then by script id. One file can declare several islands. */
	hmrEntries?: Map<string, Map<string, IslandHydrationOptions>>;
};

type IslandWindowRuntime = {
	islandRoots?: Record<string, IslandRoot>;
	islandComponents?: Record<string, IslandComponent>;
	__ecoIslandRuntime?: IslandHydrationRuntime;
	hmrHandlers?: Record<string, (url: string) => Promise<void>>;
	rerunScripts?: Record<string, () => void>;
};

type IslandWindow = Window & { __ECO_PAGES__?: IslandWindowRuntime };

/** Configuration for one compiled React Island Host entry. */
export type IslandHydrationOptions = {
	targetSelector: string;
	componentModule: Record<string, unknown>;
	componentRef?: string;
	scriptId: string;
	runtime: IslandReactRuntime;
	runtimeState: IslandHydrationRuntime;
};

/**
 * Returns the shared page runtime used by all React Island Host entries.
 *
 * @remarks
 * Keeping initialization here means generated entries only describe their
 * component and selector; they do not duplicate global runtime setup.
 *
 * @returns The shared mutable state used by all island entries on this page.
 */
export function getIslandHydrationRuntime(): IslandHydrationRuntime {
	const pageWindow = window as IslandWindow;
	const pageRuntime = (pageWindow.__ECO_PAGES__ ??= {});
	pageRuntime.islandRoots ??= {};
	pageRuntime.islandComponents ??= {};
	pageRuntime.__ecoIslandRuntime ??= {
		islandRoots: pageRuntime.islandRoots,
		islandComponents: pageRuntime.islandComponents,
	};
	pageRuntime.__ecoIslandRuntime.islandRoots = pageRuntime.islandRoots;
	pageRuntime.__ecoIslandRuntime.islandComponents = pageRuntime.islandComponents;
	return pageRuntime.__ecoIslandRuntime;
}

/**
 * Registers the development HMR callback for one component module.
 *
 * @remarks
 * The callback imports the replacement module once and delegates to
 * {@link updateIslands} for every island entry registered under the same module
 * path, since every island of one file shares that path. The dynamic import
 * function is supplied by the generated entry so HMR keeps the browser's normal
 * module-resolution behavior.
 *
 * @param options - Entry configuration whose hosts should receive updates.
 * @param importModule - Browser dynamic-import function for the replacement module.
 * @param importPath - HMR source URL used as the global handler key.
 */
export function registerIslandHmr(
	options: IslandHydrationOptions,
	importModule: (url: string) => Promise<Record<string, unknown>>,
	importPath?: string,
): void {
	if (!importPath) return;
	options.runtimeState.hmrEntries ??= new Map();
	const entries = options.runtimeState.hmrEntries.get(importPath) ?? new Map<string, IslandHydrationOptions>();
	options.runtimeState.hmrEntries.set(importPath, entries);
	entries.set(options.scriptId, options);
	const pageWindow = window as IslandWindow;
	const pageRuntime = (pageWindow.__ECO_PAGES__ ??= {});
	pageRuntime.hmrHandlers ??= {};
	pageRuntime.hmrHandlers[importPath] = async (url) => {
		const newModule = await importModule(url);
		for (const entry of entries.values()) updateIslands(entry, newModule);
	};
}

function findComponentById(module: Record<string, unknown>, componentRef: string): IslandComponent | undefined {
	return Object.values(module).find(
		(entry): entry is IslandComponent =>
			typeof entry === 'function' &&
			(entry as { config?: { identity?: { id?: string } } }).config?.identity?.id === componentRef,
	);
}

/**
 * Selects the component exported by a browser entry for the current Island Host.
 *
 * @remarks
 * Component identity is preferred when a file exports several components; each
 * declaration has its own id, so the file alone cannot tell them apart. The
 * default export and then the first function remain compatibility fallbacks for
 * entries without framework identity metadata.
 */
function resolveComponent(module: Record<string, unknown>, componentRef: string): IslandComponent | null {
	const matchById = componentRef ? findComponentById(module, componentRef) : undefined;
	if (matchById) return matchById;
	if (typeof module.default === 'function') return module.default as IslandComponent;
	return Object.values(module).find((entry): entry is IslandComponent => typeof entry === 'function') ?? null;
}

function getComponentId(target: HTMLElement): string | null {
	return target.getAttribute('data-eco-component-id');
}

function getIslandIdentity(target: HTMLElement): string {
	return getComponentId(target) ?? target.getAttribute('data-eco-component-key') ?? 'unknown';
}

type IslandLifecycleProps = {
	target: IslandHost;
	runtime: IslandReactRuntime;
	Component: IslandComponent;
	props: Record<string, unknown>;
};

/**
 * Adds the initial-commit marker while keeping one stable React component type
 * around the application component. A stable type lets HMR update props without
 * remounting this lifecycle boundary on every render.
 */
function IslandLifecycle({ target, runtime, Component, props }: IslandLifecycleProps): unknown {
	runtime.useEffect(() => {
		target.setAttribute('data-eco-hydrated', 'true');
		const record = target.__eco_island;
		if (!record) return;
		record.hydrated = true;
		if (record.pendingComponent) {
			const pendingComponent = record.pendingComponent;
			record.pendingComponent = undefined;
			record.root.render(
				runtime.createElement(IslandLifecycle, {
					target,
					runtime,
					Component: pendingComponent,
					props: readProps(target),
				}),
			);
		}
	}, [target, runtime]);
	return runtime.createElement(Component, props);
}

/**
 * Decodes the serialized props stamped on an Island Host by the server.
 * Malformed or non-object payloads become an empty props object so a broken
 * diagnostic attribute cannot prevent the rest of the page from hydrating.
 *
 * @remarks
 * Decodes the format core's `encodeIslandProps` writes in `islands/island-host.ts` (base64 of UTF-8 JSON). It is
 * inlined because this module compiles into a self-contained browser script that cannot import core.
 */
function readProps(target: HTMLElement): Record<string, unknown> {
	try {
		const encoded = target.getAttribute('data-eco-props') ?? 'e30=';
		const parsed: unknown = JSON.parse(
			new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))),
		);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/**
 * Unmounts a disconnected island and removes only its matching registry entry.
 *
 * @remarks
 * Connectivity is checked by the observer callback, after the mutation batch,
 * so moving a host within the document does not release its React root.
 */
function releaseIsland(target: IslandHost, runtimeState: IslandHydrationRuntime): void {
	if (target.isConnected) return;
	const record = target.__eco_island;
	if (!record) return;
	record.root.unmount();
	const componentId = getComponentId(target);
	if (componentId && runtimeState.islandRoots[componentId] === record.root) {
		delete runtimeState.islandRoots[componentId];
	}
	delete target.__eco_island;
}

/**
 * Installs the one document observer shared by all island entries on the page.
 * The observer releases roots for removed hosts and their descendants.
 */
function ensureObserver(runtimeState: IslandHydrationRuntime): void {
	if (runtimeState.observer || !document.documentElement) return;
	runtimeState.observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.removedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				releaseIsland(node as IslandHost, runtimeState);
				for (const target of node.querySelectorAll<HTMLElement>('[data-eco-island]'))
					releaseIsland(target as IslandHost, runtimeState);
			}
		}
	});
	runtimeState.observer.observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * Hydrates one server-emitted Island Host in place and records its lifecycle.
 *
 * @remarks
 * The record is attached immediately after `hydrateRoot` returns so
 * duplicate startup and HMR can see the host before React's initial effect runs.
 */
function hydrateTarget(
	target: IslandHost,
	component: IslandComponent,
	runtime: IslandReactRuntime,
	runtimeState: IslandHydrationRuntime,
): void {
	const root = runtime.hydrateRoot(
		target,
		runtime.createElement(IslandLifecycle, { target, runtime, Component: component, props: readProps(target) }),
		{
			onRecoverableError: (error) =>
				console.warn('[ecopages] Island hydration error', getIslandIdentity(target), error),
		},
	);
	const record: IslandRecord = { root, hydrated: false, component };
	target.__eco_island = record;
	const componentId = getComponentId(target);
	if (componentId) runtimeState.islandRoots[componentId] = record.root;
}

/**
 * Hydrates every eligible host for one component entry.
 *
 * @remarks
 * Existing host records are skipped. This makes rerun scripts idempotent and
 * avoids calling `render` while an initial `hydrateRoot` commit is
 * still pending.
 *
 * @param options - Component, selector, React runtime, and shared state for the entry.
 */
export function mountIslands(options: IslandHydrationOptions): void {
	const resolvedComponent = resolveComponent(options.componentModule, options.componentRef ?? '');
	ensureObserver(options.runtimeState);
	const pageRuntime = ((window as IslandWindow).__ECO_PAGES__ ??= {});
	pageRuntime.rerunScripts ??= {};
	pageRuntime.rerunScripts[options.scriptId] = () => mountIslands(options);
	const scriptId = options.scriptId;
	const component = options.runtimeState.islandComponents[scriptId] ?? resolvedComponent;
	if (!component) return;
	options.runtimeState.islandComponents[scriptId] = component;
	for (const element of document.querySelectorAll<HTMLElement>(options.targetSelector)) {
		const target = element as IslandHost;
		if (target.__eco_island?.root) continue;
		hydrateTarget(target, component, options.runtime, options.runtimeState);
	}
}

/**
 * Applies a hot-reloaded component to every live host owned by this entry.
 *
 * @remarks
 * Updates arriving before the initial commit are stored on each host and
 * rendered by {@link IslandLifecycle} after it marks that host hydrated.
 *
 * An entry with a component id throws when the new module exports nothing with
 * that id, for example after the declaration was renamed. Falling back to another
 * export could render a sibling or a helper; the thrown error makes the HMR
 * client reload the page instead.
 *
 * @param options - The live entry configuration and runtime state.
 * @param newModule - Newly imported component module.
 */
export function updateIslands(options: IslandHydrationOptions, newModule: Record<string, unknown>): void {
	const componentRef = options.componentRef;
	const component = componentRef ? findComponentById(newModule, componentRef) : resolveComponent(newModule, '');
	if (!component) {
		if (!componentRef) return;
		throw new Error(`[ecopages] The updated module no longer exports island component "${componentRef}".`);
	}
	options.componentModule = newModule;
	const scriptId = options.scriptId;
	options.runtimeState.islandComponents[scriptId] = component;
	for (const element of document.querySelectorAll<HTMLElement>(options.targetSelector)) {
		const target = element as IslandHost;
		const record = target.__eco_island;
		if (!record) {
			hydrateTarget(target, component, options.runtime, options.runtimeState);
			continue;
		}
		record.component = component;
		if (!record.hydrated) {
			record.pendingComponent = component;
			continue;
		}
		record.root.render(
			options.runtime.createElement(IslandLifecycle, {
				target,
				runtime: options.runtime,
				Component: component,
				props: readProps(target),
			}),
		);
	}
}
