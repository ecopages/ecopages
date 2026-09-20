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

export type PageReactRuntime = {
	hydrateRoot: (
		target: HTMLElement,
		tree: unknown,
		options?: { onRecoverableError?: (error: unknown) => void },
	) => PageRoot;
	createElement: (...args: unknown[]) => unknown;
};

export type PageData = {
	moduleUrl?: string;
	props: Record<string, unknown>;
};

export type { PageModule } from './page-hydration-module.ts';
export { resolvePageModule } from './page-hydration-module.ts';
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
	preload?: (props: Record<string, unknown>) => void | Promise<void>;
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
		mountPromise?: Promise<void>;
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
 * Invalidates pending startup, releases the page root, and hands navigation
 * ownership back to the document runtime.
 *
 * @remarks
 * Incrementing the generation prevents an already-running preload from
 * hydrating after cleanup. The pending promise is cleared so a later page can
 * start independently while the old preload settles.
 */
function cleanupPageRoot(root: PageRoot | null): void {
	const runtime = getRuntime();
	if (runtime.react) {
		runtime.react.mountGeneration = (runtime.react.mountGeneration ?? 0) + 1;
		delete runtime.react.mountPromise;
	}
	const activeRoot = runtime.react?.pageRoot || root;
	runtime.react!.pageRoot = null;
	runtime.navigation?.releaseOwnership?.('react-router');
	delete runtime.page;
	activeRoot?.unmount();
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
 * Checks whether asynchronous work still belongs to the current page instance.
 *
 * @remarks
 * Cleanup increments this token before unmounting. Any import or preload that
 * settles afterward must leave the document alone, even if a new page has
 * already mounted a root in the same global runtime slot.
 */
function isCurrentMountGeneration(generation: number): boolean {
	return (getRuntime().react?.mountGeneration ?? 0) === generation;
}

/**
 * Registers HMR before initial preload and binds it to this page generation.
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
 * Coalesces concurrent page starts into one promise.
 *
 * @remarks
 * Rerun scripts and DOM-ready callbacks can arrive together. Sharing the
 * pending promise prevents two calls to `hydrateRoot` for document.body.
 */
async function mount(options: PageHydrationOptions): Promise<void> {
	const runtime = getRuntime();
	const reactRuntime = runtime.react!;
	if (reactRuntime.mountPromise) return reactRuntime.mountPromise;
	const generation = reactRuntime.mountGeneration ?? 0;
	const pendingMount = mountPage(options, generation);
	reactRuntime.mountPromise = pendingMount;
	pendingMount.then(
		() => {
			if (reactRuntime.mountPromise === pendingMount) delete reactRuntime.mountPromise;
		},
		() => {
			if (reactRuntime.mountPromise === pendingMount) delete reactRuntime.mountPromise;
		},
	);
	return pendingMount;
}

/** Performs one page start after the caller has reserved the current generation. */
async function mountPage(options: PageHydrationOptions, generation: number): Promise<void> {
	const runtime = getRuntime();
	const pageData = readPageData(options);
	setPageState(options, pageData);

	if (runtime.react?.pageRoot) {
		if (!options.hasRouter) {
			runtime.react.pageRoot.render(options.createTree(options.Page, pageData.props));
		}
		return;
	}

	await options.preload?.(pageData.props);
	if (!isCurrentMountGeneration(generation)) return;
	if (runtime.react?.pageRoot) return;
	(window as PageWindow).__ECO_DEV_HYDRATION_STARTED__ = performance.now();
	const root = options.runtime.hydrateRoot(document.body, options.createTree(options.Page, pageData.props), {
		onRecoverableError: (error) => console.warn('[ecopages] Hydration error:', error),
	});
	runtime.react!.pageRoot = root;
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
		return mount(options);
	};

	runtime.rerunScripts ??= {};
	runtime.rerunScripts[options.scriptId] = activatePage;
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', activatePage, { once: true });
	} else {
		void activatePage();
	}
}
