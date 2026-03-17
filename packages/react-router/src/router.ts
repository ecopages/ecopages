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
	type RefObject,
} from 'react';
import { type EcoRouterOptions, DEFAULT_OPTIONS } from './types.ts';
import { RouterContext } from './context.ts';
import {
	type PageState,
	fetchPageDocument,
	getInterceptDecision,
	loadPageModuleFromDocument,
	shouldInterceptClick,
} from './navigation.ts';
import { morphHead } from './head-morpher.ts';
import { applyViewTransitionNames } from './view-transition-utils.ts';
import { manageScroll } from './manage-scroll.ts';
import { saveScrollPositions, restoreScrollPositions } from './scroll-persist.ts';
import type { EcoInjectedMeta } from '@ecopages/core';
import { getEcoNavigationRuntime, type EcoNavigationTransaction } from '@ecopages/core/router/navigation-coordinator';
import {
	getAnchorFromNavigationEvent,
	recoverPendingNavigationHref,
	type EcoPendingNavigationIntent,
} from '../../core/src/router/client/link-intent.ts';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);

const PersistLayoutsContext = createContext<boolean>(false);

type LayoutComponent = ComponentType<Record<string, unknown>>;

/**
 * Reads the optional layout assigned to a page component.
 *
 * The router recreates the server-rendered tree on the client, so it needs to
 * recover the layout reference from page config before rendering `PageContent`.
 * The returned type is widened to a generic record-based component because
 * layouts may receive serialized `locals` during hydration.
 *
 * @param Page - Hydrated page component.
 * @returns Configured layout component when present.
 */
function getLayoutFromPage(Page: ComponentType<unknown>): LayoutComponent | undefined {
	const config = (Page as ComponentType & { config?: { layout?: LayoutComponent } }).config;
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
 *
 * Stored on window to persist across module reloads during HMR/SPA navigation.
 */
function getLayoutCache(): Map<string, LayoutComponent> {
	if (typeof window === 'undefined') {
		return new Map();
	}
	const win = window as typeof window & { __ecoLayoutCache?: Map<string, LayoutComponent> };
	if (!win.__ecoLayoutCache) {
		win.__ecoLayoutCache = new Map();
	}
	return win.__ecoLayoutCache;
}

/**
 * Normalizes a layout cache key so logically identical layouts reuse the same
 * persistent instance across SPA navigations and HMR cycles.
 *
 * @param value - Raw layout identifier, display name, or injected module id.
 * @returns Stable cache key.
 */
function normalizeLayoutKey(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return 'layout';

	try {
		const asUrl = new URL(trimmed);
		return asUrl.pathname.replace(/\/$/, '') || 'layout';
	} catch {
		return trimmed.split('#')[0]?.split('?')[0]?.replace(/\/$/, '') || 'layout';
	}
}

/**
 * Clears the layout cache. Called during HMR to ensure fresh layouts are used.
 */
export function clearLayoutCache(): void {
	getLayoutCache().clear();
}

/**
 * Renders the current page with its layout.
 *
 * Must be a child of {@link EcoRouter}. When `persistLayouts` is enabled,
 * shared layouts remain mounted across navigations. When the server serialized
 * request `locals` for hydration, the same `locals` object is passed to the
 * layout on the client so the hydrated tree matches SSR.
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
	const layoutProps = props?.locals ? { locals: props.locals } : null;

	if (!Layout) {
		return pageElement;
	}

	if (persistLayouts) {
		const layoutCache = getLayoutCache();
		const layoutConfig = (Layout as LayoutComponent & { config?: { __eco?: EcoInjectedMeta } }).config;
		const layoutKeyRaw = layoutConfig?.__eco?.id || Layout.displayName || Layout.name || 'layout';
		const layoutKey = normalizeLayoutKey(layoutKeyRaw);

		if (!layoutCache.has(layoutKey)) {
			layoutCache.set(layoutKey, Layout);
		}
		const CachedLayout = layoutCache.get(layoutKey)!;

		return createElement(CachedLayout, { key: layoutKey, ...(layoutProps ?? {}) }, pageElement);
	}

	return createElement(Layout, layoutProps, pageElement);
};

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

type PendingRender = {
	navigationId: number;
	page: PageState;
	resolve: () => void;
};

function useNavigationCoordinator(
	navigate: (
		url: string,
		options?: { isPopState?: boolean; pushHistory?: boolean; skipViewTransition?: boolean },
	) => Promise<void>,
	activeNavigationRef: RefObject<EcoNavigationTransaction | null>,
	isNavigatingRef: RefObject<boolean>,
	runtimeActiveRef: RefObject<boolean>,
) {
	useEffect(() => {
		if (typeof window === 'undefined') return;

		const navigationRuntime = getEcoNavigationRuntime(window);
		let unregisterRuntime: (() => void) | null = null;
		const unregister = navigationRuntime.register({
			owner: 'react-router',
			navigate: async (request) => {
				await navigate(request.href, {
					isPopState: request.direction === 'back',
					pushHistory: request.direction === 'forward',
					skipViewTransition: request.source === 'browser-router',
				});
				return true;
			},
			reloadCurrentPage: async (request) => {
				if (activeNavigationRef.current || isNavigatingRef.current) {
					return;
				}

				if (request?.clearCache) {
					clearLayoutCache();
				}

				const currentUrl = window.location.pathname + window.location.search;
				await navigate(currentUrl);
			},
			cleanupBeforeHandoff: async () => {
				runtimeActiveRef.current = false;
				activeNavigationRef.current?.cancel();
				unregisterRuntime?.();
				unregisterRuntime = null;
				window.__ecopages_cleanup_page_root__?.();
			},
		});
		unregisterRuntime = unregister;
		navigationRuntime.claimOwnership('react-router');
		runtimeActiveRef.current = true;
		return () => {
			runtimeActiveRef.current = false;
			navigationRuntime.releaseOwnership('react-router');
			unregisterRuntime?.();
			unregisterRuntime = null;
		};
	}, [activeNavigationRef, isNavigatingRef, navigate, runtimeActiveRef]);
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
	const pendingRenderRef = useRef<PendingRender | null>(null);
	const activeNavigationRef = useRef<EcoNavigationTransaction | null>(null);
	const isNavigatingRef = useRef(false);
	const runtimeActiveRef = useRef(true);
	const pendingPointerNavigationRef = useRef<EcoPendingNavigationIntent | null>(null);
	const pendingHoverNavigationRef = useRef<EcoPendingNavigationIntent | null>(null);
	const queuedNavigationHrefRef = useRef<string | null>(null);
	const pendingScrollRestoreRef = useRef<{ url: string; isPopState: boolean } | null>(null);
	const previousUrlRef = useRef<string>(typeof window !== 'undefined' ? window.location.href : '');

	useEffect(() => {
		isNavigatingRef.current = isNavigating;
	}, [isNavigating]);

	useEffect(() => {
		setCurrentPage({ Component: page, props: pageProps });
	}, [page, pageProps]);

	useEffect(() => {
		applyViewTransitionNames();
	}, [currentPage]);

	useEffect(() => {
		const pendingRender = pendingRenderRef.current;
		if (
			pendingRender &&
			currentPage.Component === pendingRender.page.Component &&
			currentPage.props === pendingRender.page.props
		) {
			pendingRender.resolve();
			pendingRenderRef.current = null;
		}
	}, [currentPage]);

	useEffect(() => {
		return () => {
			activeNavigationRef.current?.cancel();
			pendingRenderRef.current?.resolve();
			pendingRenderRef.current = null;
			queuedNavigationHrefRef.current = null;
		};
	}, []);

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
		async (
			url: string,
			navigationOptions: { isPopState?: boolean; pushHistory?: boolean; skipViewTransition?: boolean } = {},
		) => {
			const { isPopState = false, pushHistory = false, skipViewTransition = false } = navigationOptions;
			const navigationRuntime = getEcoNavigationRuntime(window);
			const navigation = navigationRuntime.beginNavigationTransaction();
			activeNavigationRef.current = navigation;
			const navigationId = navigation.id;
			const isStale = () => !navigation.isCurrent();
			const commitPageData = (moduleUrl: string, props: Record<string, unknown>) => {
				window.__ECO_PAGE__ = {
					module: moduleUrl,
					props,
				};
			};
			let navigationCommitPromise: Promise<void> | null = null;

			try {
				setIsNavigating(true);
				const fetchedPage = await fetchPageDocument(url, { signal: navigation.signal });

				if (isStale()) return;

				if (!fetchedPage) {
					window.location.href = url;
					return;
				}

				const result = await loadPageModuleFromDocument(fetchedPage.doc, fetchedPage.finalPath);

				if (isStale()) return;

				if (result) {
					const { Component, props, doc, finalPath, moduleUrl } = result;
					const nextPage = { Component, props };
					const cleanupHead = await morphHead(doc);

					if (isStale()) {
						cleanupHead();
						return;
					}

					applyViewTransitionNames();

					if (pushHistory) {
						window.history.pushState(null, '', finalPath);
					} else if (finalPath !== url) {
						window.history.replaceState(null, '', finalPath);
					}

					saveScrollPositions();
					pendingScrollRestoreRef.current = { url, isPopState };

					if (!skipViewTransition && options.viewTransitions && document.startViewTransition) {
						pendingRenderRef.current?.resolve();
						const renderDfd = createDeferred<void>();
						pendingRenderRef.current = {
							navigationId,
							page: nextPage,
							resolve: renderDfd.resolve,
						};

						navigationCommitPromise = new Promise<void>((resolve) => {
							document.startViewTransition(async () => {
								try {
									if (isStale()) {
										if (pendingRenderRef.current?.navigationId === navigationId) {
											pendingRenderRef.current.resolve();
											pendingRenderRef.current = null;
										}
										cleanupHead();
										return;
									}
									startTransition(() => {
										commitPageData(moduleUrl, props);
										setCurrentPage(nextPage);
									});
									await renderDfd.promise;
									if (isStale()) {
										return;
									}
									cleanupHead();
									applyViewTransitionNames();
								} finally {
									resolve();
								}
							});
						});
						await navigationCommitPromise;
					} else {
						commitPageData(moduleUrl, props);
						setCurrentPage(nextPage);
						cleanupHead();
						applyViewTransitionNames();
					}
				} else {
					if (isStale()) return;

					const handled = await navigationRuntime.requestHandoff({
						href: url,
						finalHref: fetchedPage.finalPath,
						direction: isPopState ? 'back' : pushHistory ? 'forward' : 'replace',
						source: 'react-router',
						targetOwner: 'browser-router',
						document: fetchedPage.doc,
						html: fetchedPage.html,
					});

					if (!handled) {
						window.location.assign(fetchedPage.finalPath);
					}
				}
				if (!isStale()) {
					setIsNavigating(false);
				}
			} finally {
				const shouldReplayQueuedNavigation = activeNavigationRef.current?.id === navigationId;
				const queuedNavigationHref = shouldReplayQueuedNavigation ? queuedNavigationHrefRef.current : null;
				navigation.complete();
				if (activeNavigationRef.current?.id === navigationId) {
					activeNavigationRef.current = null;
				}

				if (
					queuedNavigationHref &&
					runtimeActiveRef.current &&
					queuedNavigationHref !== window.location.pathname + window.location.search
				) {
					queuedNavigationHrefRef.current = null;
					void navigate(queuedNavigationHref, { pushHistory: true });
				}
			}
		},
		[options.viewTransitions],
	);

	useEffect(() => {
		const getLinkFromEvent = (event: MouseEvent | PointerEvent) =>
			getAnchorFromNavigationEvent(event, options.linkSelector);

		const getRecoveredPointerHref = () => {
			const href = recoverPendingNavigationHref(
				pendingPointerNavigationRef.current,
				!!activeNavigationRef.current || isNavigatingRef.current,
				performance.now(),
			);

			if (!href) {
				pendingPointerNavigationRef.current = null;
			}

			return href;
		};

		const getRecoveredHoverHref = () => {
			const href = recoverPendingNavigationHref(
				pendingHoverNavigationRef.current,
				!!activeNavigationRef.current || isNavigatingRef.current,
				performance.now(),
			);

			if (!href) {
				pendingHoverNavigationRef.current = null;
			}

			return href;
		};

		const handleHoverIntent = (event: MouseEvent | PointerEvent) => {
			if (!runtimeActiveRef.current) {
				return;
			}

			const link = getLinkFromEvent(event);
			if (!link) {
				return;
			}

			const decision = getInterceptDecision(event, link, options);
			if (!decision.shouldIntercept) {
				return;
			}

			pendingHoverNavigationRef.current = {
				href: link.getAttribute('href')!,
				timestamp: performance.now(),
			};
			queuedNavigationHrefRef.current = link.getAttribute('href')!;
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (!runtimeActiveRef.current) {
				pendingPointerNavigationRef.current = null;
				return;
			}

			const link = getLinkFromEvent(event);
			if (!link) {
				pendingPointerNavigationRef.current = null;
				return;
			}

			const decision = getInterceptDecision(event as unknown as MouseEvent, link, options);
			pendingPointerNavigationRef.current = decision.shouldIntercept
				? {
						href: link.getAttribute('href')!,
						timestamp: performance.now(),
					}
				: null;

			if (decision.shouldIntercept && (activeNavigationRef.current || isNavigatingRef.current)) {
				queuedNavigationHrefRef.current = link.getAttribute('href')!;
			}
		};

		const handleClick = (event: MouseEvent) => {
			if (!runtimeActiveRef.current) {
				pendingPointerNavigationRef.current = null;
				pendingHoverNavigationRef.current = null;
				return;
			}

			const link = getLinkFromEvent(event);
			if (!link) {
				const recoveredHref = getRecoveredPointerHref() ?? getRecoveredHoverHref();
				pendingPointerNavigationRef.current = null;
				pendingHoverNavigationRef.current = null;
				if (!recoveredHref) {
					return;
				}

				event.preventDefault();
				queuedNavigationHrefRef.current = null;
				const recoveredUrl = new URL(recoveredHref, window.location.origin);
				navigate(recoveredUrl.pathname + recoveredUrl.search, { pushHistory: true });
				return;
			}
			if (!shouldInterceptClick(event, link, options)) {
				if (options.debug) {
					const decision = getInterceptDecision(event, link, options);
					if (!decision.shouldIntercept) {
						console.debug('[EcoRouter] Not intercepting link click:', decision.reason, link.href);
					}
				}
				pendingPointerNavigationRef.current = null;
				pendingHoverNavigationRef.current = null;
				return;
			}

			pendingPointerNavigationRef.current = null;
			pendingHoverNavigationRef.current = null;
			event.preventDefault();
			queuedNavigationHrefRef.current = null;
			const href = link.getAttribute('href')!;
			const url = new URL(href, window.location.origin);

			if (options.debug) {
				console.debug('[EcoRouter] Intercepting navigation:', url.pathname + url.search);
			}

			navigate(url.pathname + url.search, { pushHistory: true });
		};

		const handlePopState = () => {
			if (!runtimeActiveRef.current) {
				return;
			}

			navigate(window.location.pathname + window.location.search, { isPopState: true });
		};

		document.addEventListener('mouseover', handleHoverIntent, true);
		document.addEventListener('pointerover', handleHoverIntent, true);
		document.addEventListener('mousemove', handleHoverIntent, true);
		document.addEventListener('pointermove', handleHoverIntent, true);
		document.addEventListener('pointerdown', handlePointerDown, true);
		document.addEventListener('click', handleClick, true);
		window.addEventListener('popstate', handlePopState);

		return () => {
			document.removeEventListener('mouseover', handleHoverIntent, true);
			document.removeEventListener('pointerover', handleHoverIntent, true);
			document.removeEventListener('mousemove', handleHoverIntent, true);
			document.removeEventListener('pointermove', handleHoverIntent, true);
			document.removeEventListener('pointerdown', handlePointerDown, true);
			document.removeEventListener('click', handleClick, true);
			window.removeEventListener('popstate', handlePopState);
		};
	}, [navigate, options, runtimeActiveRef]);

	useNavigationCoordinator(navigate, activeNavigationRef, isNavigatingRef, runtimeActiveRef);

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
