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
	onUncaughtError?: (error: unknown, errorInfo: { componentStack?: string | null }) => void;
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
 * React may already have unmounted the root for an uncaught error before
 * cleanup runs.
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

/**
 * Returns the target's children that were not there before `hydrateRoot`.
 *
 * @remarks
 * Call it before unmounting: unmounting a root React already tore down clears
 * the body, sparing only scripts, styles and stylesheet links.
 */
function findAddedNodes(target: HTMLElement, serverNodes: Node[]): Node[] {
	return Array.from(target.childNodes).filter((node) => !serverNodes.includes(node));
}

/**
 * Puts the server children back in their original order, followed by `addedNodes`.
 *
 * @remarks
 * A server child still attached (React spares scripts, styles and stylesheet
 * links when it clears the body) stays as is, so a stylesheet is not fetched
 * again; every other one comes back as its pre-`hydrateRoot` clone.
 */
function restoreChildNodes(target: HTMLElement, serverNodes: Node[], serverClones: Node[], addedNodes: Node[]): void {
	target.replaceChildren(
		...serverNodes.map((node, index) => (node.parentNode === target ? node : serverClones[index]!)),
		...addedNodes,
	);
}

/**
 * Makes this Page's HMR handler reject so the HMR client reloads the document.
 *
 * @remarks
 * Restoring bumps the mount generation, so the registered handler would return
 * without rendering and the client would count the edit as applied. Deleting
 * the entry is not enough: the page module is a dev-transform URL, and the
 * client imports an unhandled one that is not the active page module and also
 * counts it as applied.
 */
function requireReloadForHmr(options: PageHydrationOptions): void {
	const handlers = getRuntime().hmrHandlers;
	if (!options.hmr || !handlers) return;
	handlers[options.hmr.importPath] = async () => {
		throw new Error('The React Page root failed and its server HTML was restored; reloading to apply the update');
	};
}

/** The path and query of the document, without the fragment, which does not change the Page. */
function currentDocumentUrl(): string {
	return `${window.location.pathname}${window.location.search}`;
}

/** Logs the component stack that React's default uncaught error reporter would print. */
function logUncaughtError(error: unknown, componentStack: string | null | undefined): void {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[ecopages] Uncaught error in the React Page: ${message}${componentStack ?? ''}`);
}

/**
 * Hydrates the page, or re-renders it when a root already exists.
 *
 * @remarks
 * Starting is synchronous, so rerun scripts and DOM-ready callbacks that arrive
 * together cannot call `hydrateRoot` twice for document.body: the second sees
 * the root the first created.
 *
 * React tears the root down after any uncaught error, such as a `React.lazy`
 * chunk that never loads with no Page-level error boundary, and would leave the
 * body empty. This snapshots the target before `hydrateRoot` and puts that
 * server HTML back on a microtask after `onUncaughtError`: the Page stays
 * readable but not interactive, and an HMR update reloads the document.
 * `React.lazy` caches a rejection, so nothing is retried.
 *
 * Restore is not limited to hydration itself: it covers any uncaught error on
 * the first-loaded Page until `root.render` (a rerun or HMR update), `unmount`
 * or a change of URL disarms it, so a stale snapshot cannot come back. The
 * router changes Pages inside the same root, so the URL is what shows it has
 * navigated; after that a Page render error becomes a full navigation, and an
 * error outside the Page leaves React's own handling.
 *
 * Providing `onUncaughtError` replaces React's default reporter, so it still
 * calls `reportError` and logs the component stack.
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
	const serverNodes = Array.from(target.childNodes);
	const serverClones = serverNodes.map((node) => node.cloneNode(true));
	const serverUrl = currentDocumentUrl();
	let allowRestore = true;
	let root: PageRoot | undefined;

	const restoreServerHtml = () => {
		if (!allowRestore || currentDocumentUrl() !== serverUrl) return;
		allowRestore = false;
		const addedNodes = findAddedNodes(target, serverNodes);
		cleanupPageRoot(runtime.react?.pageRoot ?? root ?? null);
		requireReloadForHmr(options);
		restoreChildNodes(target, serverNodes, serverClones, addedNodes);
	};

	root = options.runtime.hydrateRoot(target, options.createTree(options.Page, pageData.props), {
		onRecoverableError: (error) => console.warn('[ecopages] Hydration error:', error),
		onUncaughtError: (error, errorInfo) => {
			reportError(error);
			logUncaughtError(error, errorInfo.componentStack);
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
