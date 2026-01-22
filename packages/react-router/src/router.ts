/**
 * SPA router with View Transitions API support for React applications.
 *
 * Intercepts link clicks for client-side navigation using the History API.
 * Supports animated page transitions via CSS view-transition pseudo-elements.
 *
 * @module router
 */

import {
	useEffect,
	useState,
	useCallback,
	useMemo,
	useRef,
	createContext,
	useContext,
	startTransition,
	createElement,
	type ReactNode,
	type ComponentType,
	type FC,
} from 'react';
import { type EcoRouterOptions, DEFAULT_OPTIONS } from './types.ts';
import { RouterContext } from './context.ts';
import { type PageState, loadPageModule, shouldInterceptClick } from './navigation.ts';
import { morphHead } from './head-morpher.ts';
import { applyViewTransitionNames } from './view-transition-utils.ts';
import { manageScroll } from './manage-scroll.ts';
import { saveScrollPositions, restoreScrollPositions } from './scroll-persist.ts';
import { EcoInjectedMeta } from '../../core/src/public-types.ts';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);
const PersistLayoutsContext = createContext<boolean>(false);

function getLayoutFromPage(Page: ComponentType<unknown>): ComponentType | undefined {
	const config = (Page as ComponentType & { config?: { layout?: ComponentType } }).config;
	return config?.layout;
}

/**
 * Props for the {@link EcoRouter} component.
 */
export interface EcoRouterProps {
	/** Page component to render */
	page: ComponentType<unknown>;
	/** Props passed to the page component */
	pageProps: Record<string, unknown>;
	/** Router configuration */
	options?: EcoRouterOptions;
	/** Children (should contain {@link PageContent}) */
	children: ReactNode;
}

/**
 * Cache for layout components to ensure same reference across navigations.
 * When different pages import the same layout, they get different function
 * references. This cache ensures we reuse the first one seen for each displayName.
 */
const layoutCache = new Map<string, ComponentType>();

/**
 * Clears the layout cache. Called during HMR to ensure fresh layouts are used.
 */
export function clearLayoutCache(): void {
	layoutCache.clear();
}

/**
 * Renders the current page with its layout.
 *
 * Must be a child of {@link EcoRouter}. When `persistLayouts` is enabled,
 * shared layouts remain mounted across navigations.
 *
 * @example
 * ```tsx
 * <EcoRouter page={Page} pageProps={props}>
 *   <PageContent />
 * </EcoRouter>
 * ```
 */
export const PageContent: FC = () => {
	const pageContext = useContext(PageContext);
	const persistLayouts = useContext(PersistLayoutsContext);

	if (!pageContext) {
		if (import.meta.env.NODE_ENV !== 'production') {
			console.warn('[EcoRouter] PageContent used outside of EcoRouter');
		}
		return null;
	}

	const { Component: Page, props } = pageContext;
	const Layout = getLayoutFromPage(Page);
	const pageElement = createElement(Page, props);

	if (!Layout) {
		return pageElement;
	}

	if (persistLayouts) {
		const layoutConfig = (Layout as ComponentType & { config?: { __eco?: EcoInjectedMeta } }).config;
		const layoutKey = layoutConfig?.__eco?.dir || Layout.displayName || Layout.name || 'layout';

		if (!layoutCache.has(layoutKey)) {
			layoutCache.set(layoutKey, Layout);
		}
		const CachedLayout = layoutCache.get(layoutKey)!;

		return createElement(CachedLayout, { key: layoutKey }, pageElement);
	}

	return createElement(Layout, null, pageElement);
};

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function useHmrReload(navigate: (url: string) => Promise<void>) {
	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (import.meta.env?.MODE === 'production' || import.meta.env?.PROD) return;

		const windowWithHmr = window as typeof window & {
			__ecopages_reload_current_page__?: () => Promise<void>;
		};

		windowWithHmr.__ecopages_reload_current_page__ = async () => {
			clearLayoutCache();
			const currentUrl = window.location.pathname + window.location.search;
			await navigate(currentUrl);
		};

		return () => {
			windowWithHmr.__ecopages_reload_current_page__ = undefined;
		};
	}, [navigate]);
}

/**
 * Root router providing SPA navigation with View Transitions.
 *
 * Coordinates navigation flow:
 * 1. Intercepts link clicks and popstate events
 * 2. Loads page module and updates document head
 * 3. Triggers View Transition (if supported)
 * 4. Updates React state inside transition callback
 * 5. Resolves deferred promise after render
 * 6. Browser captures new DOM snapshot
 *
 * @example
 * ```tsx
 * <EcoRouter
 *   page={CurrentPage}
 *   pageProps={pageProps}
 *   options={{ persistLayouts: true }}
 * >
 *   <PageContent />
 * </EcoRouter>
 * ```
 *
 * @example Shared element transitions
 * ```tsx
 * // List page
 * <img data-view-transition={`hero-${id}`} src={src} />
 *
 * // Detail page
 * <img data-view-transition={`hero-${id}`} src={src} />
 * ```
 */
export const EcoRouter: FC<EcoRouterProps> = ({ page, pageProps, options: userOptions, children }: EcoRouterProps) => {
	const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...userOptions }), [userOptions]);
	const [currentPage, setCurrentPage] = useState<PageState>({ Component: page, props: pageProps });
	const [isNavigating, setIsNavigating] = useState(false);
	const [pendingPage, setPendingPage] = useState<PageState | null>(null);
	const renderDfd = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
	const pendingScrollRestoreRef = useRef<{ url: string; isPopState: boolean } | null>(null);
	const previousUrlRef = useRef<string>(typeof window !== 'undefined' ? window.location.href : '');

	useEffect(() => {
		setCurrentPage({ Component: page, props: pageProps });
	}, [page, pageProps]);

	useEffect(() => {
		applyViewTransitionNames();
	}, [currentPage]);

	useEffect(() => {
		if (pendingPage && currentPage.Component === pendingPage.Component && renderDfd.current) {
			renderDfd.current.resolve();
			renderDfd.current = null;
			setPendingPage(null);
		}
	}, [currentPage, pendingPage]);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		const url = new URL(window.location.href);
		const previousUrl = new URL(previousUrlRef.current);

		if (url.href !== previousUrl.href) {
			manageScroll(url, previousUrl, {
				scrollBehavior: options.scrollBehavior,
				smoothScroll: options.smoothScroll,
			});
			previousUrlRef.current = url.href;
		}

		if (pendingScrollRestoreRef.current) {
			const { url: targetUrl, isPopState } = pendingScrollRestoreRef.current;
			restoreScrollPositions(targetUrl, isPopState);
			pendingScrollRestoreRef.current = null;
		}
	}, [currentPage, options.scrollBehavior, options.smoothScroll]);

	const navigate = useCallback(
		async (url: string, isPopState = false) => {
			setIsNavigating(true);
			const result = await loadPageModule(url);

			if (result) {
				const { Component, props, doc } = result;
				const nextPage = { Component, props };
				const cleanupHead = await morphHead(doc);
				applyViewTransitionNames();

				saveScrollPositions();
				pendingScrollRestoreRef.current = { url, isPopState };

				if (options.viewTransitions && document.startViewTransition) {
					renderDfd.current = createDeferred<void>();
					setPendingPage(nextPage);

					document.startViewTransition(async () => {
						startTransition(() => {
							setCurrentPage(nextPage);
						});
						await renderDfd.current?.promise;
						cleanupHead();
						applyViewTransitionNames();
					});
				} else {
					setCurrentPage(nextPage);
					cleanupHead();
					applyViewTransitionNames();
				}
			} else {
				window.location.href = url;
			}
			setIsNavigating(false);
		},
		[options.viewTransitions],
	);

	useEffect(() => {
		const handleClick = (event: MouseEvent) => {
			const link = (event.target as Element).closest(options.linkSelector) as HTMLAnchorElement | null;
			if (!link || !shouldInterceptClick(event, link, options)) return;

			event.preventDefault();
			const href = link.getAttribute('href')!;
			const url = new URL(href, window.location.origin);

			window.history.pushState(null, '', url.href);
			navigate(url.pathname + url.search);
		};

		const handlePopState = () => {
			navigate(window.location.pathname + window.location.search, true);
		};

		document.addEventListener('click', handleClick);
		window.addEventListener('popstate', handlePopState);

		return () => {
			document.removeEventListener('click', handleClick);
			window.removeEventListener('popstate', handlePopState);
		};
	}, [navigate, options]);

	useHmrReload(navigate);

	return createElement(
		RouterContext.Provider,
		{ value: { navigate, isNavigating } },
		createElement(
			PersistLayoutsContext.Provider,
			{ value: options.persistLayouts },
			createElement(PageContext.Provider, { value: currentPage }, children),
		),
	);
};
