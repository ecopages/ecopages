/**
 * Browser-side React page lifecycle.
 *
 * @remarks
 * The entry module supplies the page tree and module resolution details. This
 * module owns document state, navigation ownership, cleanup, and HMR so those
 * behaviors stay identical for readable and compiled bootstraps.
 */

export type PageRoot = {
	render: (tree: unknown) => void;
	unmount: () => void;
};

export type PageHydrateRootOptions = {
	onRecoverableError?: (error: unknown) => void;
	onUncaughtError?: (error: unknown) => void;
};

export type PageReactRuntime = {
	hydrateRoot: (target: HTMLElement, tree: unknown, options?: PageHydrateRootOptions) => PageRoot;
	createElement: (...args: unknown[]) => unknown;
};

export type PageData = {
	moduleUrl?: string;
	props: Record<string, unknown>;
};

export { resolvePageComponent } from './page-hydration-module.ts';
import { handlePageHmr } from './page-hydration-hmr.ts';

/** Configuration passed from a generated Page hydration entry. */
export type PageHydrationOptions = {
	scriptId: string;
	pageModuleUrl: string;
	Page: unknown;
	pageDataReader: {
		readPageDataDocument: () => PageData;
		getPageDataFromDocument: () => Record<string, unknown>;
	};
	runtime: PageReactRuntime;
	createTree: (Page: unknown, props: Record<string, unknown>) => unknown;
	hasRouter: boolean;
	isMdx: boolean;
	normalizePageConfig?: (config: unknown) => void;
	hmr?: {
		importPath: string;
		getLayoutStack?: (Page: unknown) => string;
	};
};

type PageNavigationRuntime = {
	getOwnerState?: () => { owner: string; canHandleSpaNavigation: boolean };
	register?: (registration: { owner: string; cleanupBeforeHandoff: () => Promise<void> }) => void;
	claimOwnership?: (owner: string) => void;
	releaseOwnership?: (owner: string) => void;
	reloadCurrentPage?: (options: Record<string, unknown>) => Promise<void> | void;
};

type PageWindowRuntime = {
	hmrHandlers?: Record<string, (url: string) => Promise<void>>;
	navigation?: PageNavigationRuntime;
	react?: {
		cleanupPageRoot?: () => void;
		pageRoot?: PageRoot | null;
		mountGeneration?: number;
	};
	page?: { module: string; props: Record<string, unknown> };
	rerunScripts?: Record<string, () => unknown>;
};

type PageWindow = Window & {
	__ECO_PAGES__?: PageWindowRuntime;
	__ECO_DEV_HYDRATION_STARTED__?: number;
	__ECO_DEV_HYDRATION_MS__?: number;
};

/** Returns and lazily initializes the shared page runtime on `window`. */
function getRuntime(): PageWindowRuntime {
	const pageWindow = window as PageWindow;
	const runtime = (pageWindow.__ECO_PAGES__ ??= {});
	runtime.react ??= {};
	return runtime;
}

/** Records the development hydration duration when the dev marker is present. */
function recordHydrationTiming(): void {
	const pageWindow = window as PageWindow;
	if (pageWindow.__ECO_DEV_HYDRATION_STARTED__ == null) return;
	pageWindow.__ECO_DEV_HYDRATION_MS__ = Math.round(performance.now() - pageWindow.__ECO_DEV_HYDRATION_STARTED__);
}

/** Reads the current page-data document through the shared reader contract. */
function readPageData(options: PageHydrationOptions): PageData {
	return options.pageDataReader.readPageDataDocument();
}

/** Publishes the current module URL and props for router/navigation consumers. */
function setPageState(options: PageHydrationOptions, pageData: PageData): void {
	const runtime = getRuntime();
	runtime.page = {
		module: pageData.moduleUrl || options.pageModuleUrl,
		props: pageData.props,
	};
}

/**
 * Unmounts a page root when it is still mounted.
 *
 * @remarks
 * React may already have unmounted the root for an uncaught first-hydration
 * error before cleanup runs.
 */
function unmountPageRoot(root: PageRoot | null | undefined): void {
	try {
		root?.unmount();
	} catch {
		return;
	}
}

/**
 * Invalidates pending HMR updates, releases the page root, and hands navigation
 * ownership back to the document runtime.
 */
function cleanupPageRoot(root: PageRoot | null): void {
	const runtime = getRuntime();
	if (runtime.react) {
		runtime.react.mountGeneration = (runtime.react.mountGeneration ?? 0) + 1;
	}
	const activeRoot = runtime.react?.pageRoot || root;
	runtime.react!.pageRoot = null;
	runtime.navigation?.releaseOwnership?.('react-router');
	delete runtime.page;
	unmountPageRoot(activeRoot);
}

/** Registers React Router as the page navigation owner when this page uses it. */
function registerRouterOwnership(options: PageHydrationOptions): void {
	if (!options.hasRouter) return;
	const runtime = getRuntime();
	const ownerState = runtime.navigation?.getOwnerState?.();
	if (ownerState?.owner === 'react-router' && ownerState.canHandleSpaNavigation) return;
	runtime.navigation?.register?.({
		owner: 'react-router',
		cleanupBeforeHandoff: async () => cleanupPageRoot(runtime.react?.pageRoot ?? null),
	});
	runtime.navigation?.claimOwnership?.('react-router');
}

/**
 * Registers HMR before the page mounts and binds it to this page generation.
 *
 * @remarks
 * The global handler index can outlive the page. Capturing the generation here
 * makes retained callbacks inert after cleanup, including calls that begin only
 * after another page has mounted. Reactivation renews this binding for the
 * new generation.
 */
function registerHmr(options: PageHydrationOptions): void {
	if (!options.hmr) return;
	const runtime = getRuntime();
	const generation = runtime.react?.mountGeneration ?? 0;
	runtime.hmrHandlers ??= {};
	runtime.hmrHandlers[options.hmr.importPath] = (newUrl) =>
		handlePageHmr(options, newUrl, generation, readPageData, setPageState, (opts) =>
			opts.pageDataReader.getPageDataFromDocument(),
		);
}

/** Copies the hydrate target's children so a failed first hydration can restore them. */
function cloneChildNodes(target: HTMLElement): Node[] {
	return Array.from(target.childNodes, (node) => node.cloneNode(true));
}

/** Replaces the hydrate target's children with clones of a snapshot taken before `hydrateRoot`. */
function restoreChildNodes(target: HTMLElement, snapshot: Node[]): void {
	target.replaceChildren(...snapshot.map((node) => node.cloneNode(true)));
}

/**
 * Hydrates the page, or re-renders it when a root already exists.
 *
 * @remarks
 * Starting is synchronous, so rerun scripts and DOM-ready callbacks that arrive
 * together cannot call `hydrateRoot` twice for document.body: the second sees
 * the root the first created.
 *
 * An uncaught error during this first `hydrateRoot` (a `React.lazy` chunk that
 * never loads, with no Page-level error boundary) tears the root down after
 * `onUncaughtError`. This snapshots the target before `hydrateRoot` and puts
 * that HTML back on a microtask after the callback. Providing the handler
 * replaces React's default reporter, so it still calls `reportError`.
 * `React.lazy` caches a rejection, so this path does not retry. A later
 * `root.render` or `unmount` disables restore so that first snapshot cannot
 * come back.
 */
function mount(options: PageHydrationOptions): void {
	const runtime = getRuntime();
	const pageData = readPageData(options);
	setPageState(options, pageData);

	if (runtime.react?.pageRoot) {
		if (!options.hasRouter) {
			runtime.react.pageRoot.render(options.createTree(options.Page, pageData.props));
		}
		return;
	}

	(window as PageWindow).__ECO_DEV_HYDRATION_STARTED__ = performance.now();
	const target = document.body;
	const serverHtml = cloneChildNodes(target);
	let allowRestore = true;
	let root: PageRoot | undefined;

	const restoreServerHtml = () => {
		if (!allowRestore) return;
		allowRestore = false;
		cleanupPageRoot(runtime.react?.pageRoot ?? root ?? null);
		restoreChildNodes(target, serverHtml);
	};

	root = options.runtime.hydrateRoot(target, options.createTree(options.Page, pageData.props), {
		onRecoverableError: (error) => console.warn('[ecopages] Hydration error:', error),
		onUncaughtError: (error) => {
			reportError(error);
			queueMicrotask(restoreServerHtml);
		},
	});

	runtime.react!.pageRoot = {
		render: (tree) => {
			allowRestore = false;
			root.render(tree);
		},
		unmount: () => {
			allowRestore = false;
			unmountPageRoot(root);
		},
	};
	recordHydrationTiming();
}

/**
 * Registers and starts the Page lifecycle when its persistent script is present.
 *
 * @remarks
 * Restores lifecycle registration, router ownership, and HMR generation binding
 * whenever the page is activated or rerun after navigation.
 *
 * @param options - Generated entry configuration for the current Page.
 */
export function startPageHydration(options: PageHydrationOptions): void {
	if (!document.querySelector(`script[data-eco-script-id="${options.scriptId}"]`)) return;
	const runtime = getRuntime();
	runtime.react!.pageRoot ??= null;
	const initialPageData = readPageData(options);
	setPageState(options, initialPageData);

	const activatePage = () => {
		runtime.react!.cleanupPageRoot = () => cleanupPageRoot(runtime.react?.pageRoot ?? null);
		registerRouterOwnership(options);
		registerHmr(options);
		mount(options);
	};

	runtime.rerunScripts ??= {};
	runtime.rerunScripts[options.scriptId] = activatePage;
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', activatePage, { once: true });
	} else {
		activatePage();
	}
}
