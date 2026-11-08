/**
 * SPA router with View Transitions API support for React applications.
 *
 * Intercepts link clicks for client-side navigation using the History API.
 * Supports animated page transitions via CSS view-transition pseudo-elements.
 *
 * @module router
 */

/* oxlint-disable react/refs, react-hooks/exhaustive-deps */

import { isProductionRuntime } from '@ecopages/core';
import {
	useEffect,
	useEffectEvent,
	useState,
	useCallback,
	useMemo,
	useRef,
	createContext,
	useContext,
	startTransition,
	createElement,
	Fragment,
	type ReactNode,
	type ComponentType,
	type FC,
	type RefObject,
	type SetStateAction,
} from 'react';
import { type EcoRouterOptions, DEFAULT_OPTIONS } from './types.ts';
import { RouterContext, type RouterNavigateRequestOptions } from './context.ts';
import { getLinkNavigationDecision, isSamePageHashNavigationHref } from '@ecopages/core/client';
import { invalidateNavigationHtml } from '@ecopages/core/client';
import { type PageState } from './navigation.ts';
import { PageErrorBoundary } from './page-error-boundary.ts';
import { runRouterNavigate, type RouterNavigateOptions } from './router-navigate-runner.ts';
import { applyViewTransitionNames, ensureRootViewTransitionStyles } from '@ecopages/core/client';
import { manageWindowScroll, schedulePageLoad } from '@ecopages/core/client';
import {
	getEcoNavigationRuntime,
	type EcoNavigationRequest,
	type EcoNavigationTransaction,
	type EcoReloadRequest,
} from '@ecopages/core/client';
import { composeLayoutPageTree, assertComposablePage } from '@ecopages/react/layout-compose';
import {
	getAnchorFromNavigationEvent,
	recoverPendingNavigationHref,
	type EcoPendingNavigationIntent,
} from '@ecopages/core/client';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);

const PersistLayoutsContext = createContext<boolean>(false);

const pageMountKeys = new WeakMap<object, string>();
let nextPageMountKey = 0;

/**
 * Keys a page's tree so that, with `persistLayouts` off, its layouts remount when the page changes.
 */
function getPageMountKey(Page: object): string {
	let key = pageMountKeys.get(Page);
	if (!key) {
		nextPageMountKey += 1;
		key = `page-${nextPageMountKey}`;
		pageMountKeys.set(Page, key);
	}
	return key;
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
 * Renders the current page with its layout.
 *
 * Must be a child of {@link EcoRouter}. When `persistLayouts` is enabled, a layout tier stays mounted while
 * consecutive pages pass the same layout function: a layout module has one URL, so every page that imports it
 * gets the same function, and React keeps its state. When the server serialized request `locals` for
 * hydration, the same `locals` object is passed to the layout on the client so the hydrated tree matches SSR.
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
		if (!isProductionRuntime()) {
			console.warn('[EcoRouter] PageContent used outside of EcoRouter');
		}
		return null;
	}

	const { Component: Page, props } = pageContext;

	if (typeof Page !== 'function') {
		return null;
	}

	const tree = composeLayoutPageTree(assertComposablePage(Page), props);
	return persistLayouts ? tree : createElement(Fragment, { key: getPageMountKey(Page) }, tree);
};

function reloadCurrentDocument(): void {
	window.location.reload();
}

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
		options?: {
			isPopState?: boolean;
			pushHistory?: boolean;
			skipViewTransition?: boolean;
			moduleUrlOverride?: string;
		},
	) => Promise<void>,
	activeNavigationRef: RefObject<EcoNavigationTransaction | null>,
	isNavigatingRef: RefObject<boolean>,
	runtimeActiveRef: RefObject<boolean>,
) {
	const handleCoordinatorNavigate = useEffectEvent(async (request: EcoNavigationRequest) => {
		await navigate(request.href, {
			isPopState: request.direction === 'back',
			pushHistory: request.direction === 'forward',
			skipViewTransition: request.source === 'browser-router',
		});
		return true;
	});

	const handleCoordinatorReload = useEffectEvent(async (request?: EcoReloadRequest) => {
		if (activeNavigationRef.current || isNavigatingRef.current) {
			return false;
		}

		const currentUrl = window.location.href;
		if (request?.clearCache) {
			invalidateNavigationHtml(currentUrl);
		}

		await navigate(currentUrl, {
			moduleUrlOverride: request?.moduleUrl,
			skipViewTransition: true,
		});
		return true;
	});

	const handleCleanupBeforeHandoff = useEffectEvent(async () => {
		runtimeActiveRef.current = false;
		window.__ECO_PAGES__?.react?.cleanupPageRoot?.();
	});

	useEffect(() => {
		const navigationRuntime = getEcoNavigationRuntime(window);
		let unregisterRuntime: (() => void) | null = null;
		const unregister = navigationRuntime.register({
			owner: 'react-router',
			navigate: handleCoordinatorNavigate,
			reloadCurrentPage: handleCoordinatorReload,
			cleanupBeforeHandoff: async () => {
				unregisterRuntime?.();
				unregisterRuntime = null;
				await handleCleanupBeforeHandoff();
			},
		});
		unregisterRuntime = unregister;
		navigationRuntime.claimOwnership('react-router');
		runtimeActiveRef.current = true;
		schedulePageLoad(
			document,
			{ url: new URL(window.location.href), direction: 'replace' },
			{ isSuperseded: () => !runtimeActiveRef.current },
		);
		return () => {
			runtimeActiveRef.current = false;
			navigationRuntime.releaseOwnership('react-router');
			unregisterRuntime?.();
			unregisterRuntime = null;
		};
	}, [runtimeActiveRef]);
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
	const [currentPage, setCurrentPage] = useState<PageState>({
		Component: page,
		props: pageProps,
	});
	const [isNavigating, setIsNavigating] = useState(false);
	const pendingRenderRef = useRef<PendingRender | null>(null);
	const activeNavigationRef = useRef<EcoNavigationTransaction | null>(null);
	const isNavigatingRef = useRef(false);
	const hasNavigatedRef = useRef(false);
	const runtimeActiveRef = useRef(true);
	const isInitialPagePropSyncRef = useRef(true);
	const pendingPointerNavigationRef = useRef<EcoPendingNavigationIntent | null>(null);
	const queuedNavigationHrefRef = useRef<string | null>(null);
	const committedPathRef = useRef<string>(
		typeof window !== 'undefined' ? window.location.pathname + window.location.search + window.location.hash : '',
	);
	const previousUrlRef = useRef<string>(typeof window !== 'undefined' ? window.location.href : '');

	useEffect(() => {
		isNavigatingRef.current = isNavigating;
	}, [isNavigating]);

	useEffect(() => {
		if (isInitialPagePropSyncRef.current) {
			isInitialPagePropSyncRef.current = false;
			setCurrentPage((current) => {
				if (current.Component === page && current.props === pageProps) {
					return current;
				}

				return { Component: page, props: pageProps };
			});
			return;
		}

		setCurrentPage({ Component: page, props: pageProps });
	}, [page, pageProps]);

	useEffect(() => {
		if (options.viewTransitions) {
			ensureRootViewTransitionStyles();
		}
	}, [options.viewTransitions]);

	useEffect(() => {
		committedPathRef.current = window.location.pathname + window.location.search + window.location.hash;
		applyViewTransitionNames();

		const pendingRender = pendingRenderRef.current;
		if (
			pendingRender &&
			currentPage.Component === pendingRender.page.Component &&
			currentPage.props === pendingRender.page.props
		) {
			pendingRender.resolve();
			pendingRenderRef.current = null;
		}

		const url = new URL(window.location.href);
		const previousUrl = new URL(previousUrlRef.current);

		if (url.href !== previousUrl.href) {
			manageWindowScroll(url, previousUrl, {
				scrollBehavior: options.scrollBehavior,
				smoothScroll: options.smoothScroll,
			});
			previousUrlRef.current = url.href;
		}
	}, [currentPage, options.scrollBehavior, options.smoothScroll]);

	useEffect(() => {
		return () => {
			activeNavigationRef.current?.cancel();
			pendingRenderRef.current?.resolve();
			pendingRenderRef.current = null;
			queuedNavigationHrefRef.current = null;
		};
	}, []);

	const commitNavigatedPage = useCallback((page: SetStateAction<PageState>) => {
		hasNavigatedRef.current = true;
		setCurrentPage(page);
	}, []);

	const navigateRef = useRef<(url: string, navigationOptions?: RouterNavigateOptions) => Promise<void>>(
		async () => {},
	);
	const navigate = useCallback(
		async (url: string, navigationOptions = {}) => {
			await runRouterNavigate(url, navigationOptions, {
				options,
				pendingRenderRef,
				activeNavigationRef,
				isNavigatingRef,
				runtimeActiveRef,
				queuedNavigationHrefRef,
				committedPathRef,
				setIsNavigating,
				setCurrentPage: commitNavigatedPage,
				startTransition,
				createDeferred,
				replayLocalNavigate: (href) => {
					void navigateRef.current(href, { pushHistory: true });
				},
			});
		},
		[options],
	);

	useEffect(() => {
		navigateRef.current = navigate;
	}, [navigate]);

	const navigateWithHistory = useCallback(
		(url: string, requestOptions: RouterNavigateRequestOptions = {}) =>
			navigate(url, { pushHistory: !requestOptions.replace }),
		[navigate],
	);

	const getLinkFromEvent = useEffectEvent((event: MouseEvent | PointerEvent) =>
		getAnchorFromNavigationEvent(event, options.linkSelector),
	);

	const getRecoveredPointerHref = useEffectEvent(() => {
		const href = recoverPendingNavigationHref(
			pendingPointerNavigationRef.current,
			!!activeNavigationRef.current || isNavigatingRef.current,
			performance.now(),
		);

		if (!href) {
			pendingPointerNavigationRef.current = null;
		}

		return href;
	});

	const handlePointerDown = useEffectEvent((event: PointerEvent) => {
		if (!runtimeActiveRef.current) {
			pendingPointerNavigationRef.current = null;
			return;
		}

		const link = getLinkFromEvent(event);
		if (!link) {
			pendingPointerNavigationRef.current = null;
			return;
		}

		const decision = getLinkNavigationDecision(event, link, {
			reloadAttribute: options.reloadAttribute,
		});
		pendingPointerNavigationRef.current = decision.shouldIntercept
			? {
					href: decision.href,
					timestamp: performance.now(),
				}
			: null;

		if (decision.shouldIntercept && (activeNavigationRef.current || isNavigatingRef.current)) {
			queuedNavigationHrefRef.current = decision.href;
		}
	});

	const handleClick = useEffectEvent((event: MouseEvent) => {
		if (!runtimeActiveRef.current) {
			pendingPointerNavigationRef.current = null;
			return;
		}

		const link = getLinkFromEvent(event);
		if (!link) {
			const recoveredHref = getRecoveredPointerHref();
			pendingPointerNavigationRef.current = null;
			if (!recoveredHref) {
				return;
			}

			if (isSamePageHashNavigationHref(recoveredHref)) {
				queuedNavigationHrefRef.current = null;
				return;
			}

			event.preventDefault();
			queuedNavigationHrefRef.current = null;
			const recoveredUrl = new URL(recoveredHref, window.location.href);
			navigate(recoveredUrl.pathname + recoveredUrl.search + recoveredUrl.hash, { pushHistory: true });
			return;
		}

		const decision = getLinkNavigationDecision(event, link, {
			reloadAttribute: options.reloadAttribute,
		});
		if (!decision.shouldIntercept) {
			if (options.debug) {
				console.debug('[EcoRouter] Not intercepting link click:', decision.reason, link.href);
			}
			pendingPointerNavigationRef.current = null;
			return;
		}

		pendingPointerNavigationRef.current = null;
		event.preventDefault();
		queuedNavigationHrefRef.current = null;
		const url = new URL(decision.href, window.location.origin);

		if (options.debug) {
			console.debug('[EcoRouter] Intercepting navigation:', url.pathname + url.search);
		}

		navigate(url.pathname + url.search + url.hash, { pushHistory: true });
	});

	const handlePopState = useEffectEvent(() => {
		if (!runtimeActiveRef.current) {
			return;
		}

		navigate(window.location.pathname + window.location.search + window.location.hash, { isPopState: true });
	});

	useEffect(() => {
		const onPointerDown = (event: Event) => {
			handlePointerDown(event as PointerEvent);
		};

		const onClick = (event: Event) => {
			handleClick(event as MouseEvent);
		};

		const onPopState = () => {
			handlePopState();
		};

		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('click', onClick, true);
		window.addEventListener('popstate', onPopState);

		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('click', onClick, true);
			window.removeEventListener('popstate', onPopState);
		};
	}, []);

	useNavigationCoordinator(navigate, activeNavigationRef, isNavigatingRef, runtimeActiveRef);

	return createElement(
		RouterContext.Provider,
		{ value: { navigate: navigateWithHistory, isNavigating } },
		createElement(
			PersistLayoutsContext.Provider,
			{ value: options.persistLayouts },
			createElement(
				PageErrorBoundary,
				{
					hasNavigated: () => hasNavigatedRef.current,
					reloadDocument: reloadCurrentDocument,
				},
				createElement(PageContext.Provider, { value: currentPage }, children),
			),
		),
	);
};
