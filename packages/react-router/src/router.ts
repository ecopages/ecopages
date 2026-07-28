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
	useEffectEvent,
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
import { getLinkNavigationDecision, isSamePageHashNavigationHref } from '@ecopages/core/router/link-navigation-policy';
import { type PageState } from './navigation.ts';
import {
	applyHandoffNavigation,
	applySpaNavigation,
	decideQueuedNavigationReplay,
	resolveReactNavigation,
} from './navigation-orchestrator.ts';
import { morphHead } from './head-morpher.ts';
import { applyViewTransitionNames, ensureRootViewTransitionStyles } from '@ecopages/core/client/view-transitions';
import { manageWindowScroll } from '@ecopages/core/client/scroll';
import { saveScrollPositions, restoreScrollPositions } from './scroll-persist.ts';
import {
	getEcoNavigationRuntime,
	type EcoNavigationRequest,
	type EcoNavigationTransaction,
	type EcoReloadRequest,
} from '@ecopages/core/router/navigation-coordinator';
import { clearLayoutCache, resolvePersistedLayoutStack, type LayoutComponent } from './layout-cache.ts';
import {
	composeLayoutPageTree,
	assertComposablePage,
	normalizePageLayoutComponents,
	type ComposablePage,
} from '@ecopages/react/layout-compose';
import type { EcoComponent } from '@ecopages/core';
import {
	getAnchorFromNavigationEvent,
	recoverPendingNavigationHref,
	type EcoPendingNavigationIntent,
} from '@ecopages/core/router/link-intent';

/**
 * Router-owned page state.
 *
 * `refreshPersistedLayout` is reserved for refresh-style updates where the
 * route stays logically the same but the page module may have changed, such as
 * HMR or top-level page prop refreshes. Ordinary SPA navigation keeps this flag
 * unset so persisted layouts retain their existing mounted instance.
 */
type RouterPageState = PageState & {
	refreshPersistedLayout?: boolean;
};

type PageContextValue = RouterPageState | null;

const PageContext = createContext<PageContextValue>(null);

const PersistLayoutsContext = createContext<boolean>(false);

/**
 * @remarks
 * Eco declared layouts widen to React callables for the persistence cache.
 */
function resolvePageLayoutStack(pageConfig?: ComposablePage['config']): LayoutComponent[] {
	const layoutEntries = pageConfig?.layoutEntries;
	if (layoutEntries && layoutEntries.length > 0) {
		return layoutEntries.map((entry) => entry.component) as LayoutComponent[];
	}

	return normalizePageLayoutComponents(pageConfig?.layouts) as LayoutComponent[];
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

export { clearLayoutCache } from './layout-cache.ts';

/**
 * Renders the current page with its layout.
 *
 * Must be a child of {@link EcoRouter}. When `persistLayouts` is enabled,
 * shared layouts remain mounted across navigations. When the server serialized
 * request `locals` for hydration, the same `locals` object is passed to the
 * layout on the client so the hydrated tree matches SSR. Refresh-style updates
 * may still replace the cached layout implementation when the router marks the
 * page state with `refreshPersistedLayout`.
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

	const { Component: Page, props, refreshPersistedLayout } = pageContext;

	if (typeof Page !== 'function') {
		return null;
	}

	const composablePage = assertComposablePage(Page);
	const layoutComponents = resolvePageLayoutStack(composablePage.config);
	const shouldRefreshPersistedLayout = Boolean(refreshPersistedLayout);
	const persistedTiers =
		persistLayouts && layoutComponents.length > 0
			? resolvePersistedLayoutStack(layoutComponents, shouldRefreshPersistedLayout)
			: undefined;

	return composeLayoutPageTree(composablePage, props, {
		resolvePersistedTier: persistedTiers
			? (_layout, index) => ({
					layout: persistedTiers[index]!.layout as EcoComponent,
					key: persistedTiers[index]!.key,
				})
			: undefined,
	});
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

		if (request?.clearCache) {
			clearLayoutCache();
		}

		const currentUrl = window.location.pathname + window.location.search;
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
	const [currentPage, setCurrentPage] = useState<RouterPageState>({
		Component: page,
		props: pageProps,
		refreshPersistedLayout: false,
	});
	const [isNavigating, setIsNavigating] = useState(false);
	const pendingRenderRef = useRef<PendingRender | null>(null);
	const activeNavigationRef = useRef<EcoNavigationTransaction | null>(null);
	const isNavigatingRef = useRef(false);
	const runtimeActiveRef = useRef(true);
	const isInitialPagePropSyncRef = useRef(true);
	const pendingPointerNavigationRef = useRef<EcoPendingNavigationIntent | null>(null);
	const queuedNavigationHrefRef = useRef<string | null>(null);
	const committedPathRef = useRef<string>(
		typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
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

				return { Component: page, props: pageProps, refreshPersistedLayout: false };
			});
			return;
		}

		setCurrentPage({ Component: page, props: pageProps, refreshPersistedLayout: true });
	}, [page, pageProps]);

	useEffect(() => {
		if (options.viewTransitions) {
			ensureRootViewTransitionStyles();
		}
	}, [options.viewTransitions]);

	useEffect(() => {
		committedPathRef.current = window.location.pathname + window.location.search;
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

	const navigate = useCallback(
		async (
			url: string,
			navigationOptions: {
				isPopState?: boolean;
				pushHistory?: boolean;
				skipViewTransition?: boolean;
				moduleUrlOverride?: string;
			} = {},
		) => {
			const {
				isPopState = false,
				pushHistory = false,
				skipViewTransition = false,
				moduleUrlOverride,
			} = navigationOptions;
			const navigationRuntime = getEcoNavigationRuntime(window);
			const navigation = navigationRuntime.beginNavigationTransaction();
			activeNavigationRef.current = navigation;
			const navigationId = navigation.id;
			const isStale = () => !navigation.isCurrent();
			const waitForRender = (nextPage: RouterPageState) => {
				pendingRenderRef.current?.resolve();
				const renderDfd = createDeferred<void>();
				pendingRenderRef.current = {
					navigationId,
					page: nextPage,
					resolve: renderDfd.resolve,
				};
				return renderDfd.promise;
			};

			try {
				isNavigatingRef.current = true;
				setIsNavigating(true);

				const outcome = await resolveReactNavigation({
					url,
					signal: navigation.signal,
					isStale,
					isPopState,
					pushHistory,
					moduleUrlOverride,
				});

				if (outcome.kind === 'stale') {
					return;
				}

				if (outcome.kind === 'hard-navigation') {
					if (outcome.mode === 'assign') {
						window.location.assign(outcome.href);
					} else {
						window.location.href = outcome.href;
					}
					return;
				}

				if (outcome.kind === 'spa') {
					await applySpaNavigation(
						outcome,
						{
							isStale,
							hardAssign: (href) => {
								window.location.assign(href);
							},
							morphHead,
							applyViewTransitionNames,
							saveScrollPositions,
							restoreScrollPositions,
							updateHistory: (finalPath, requestedUrl, direction) => {
								if (direction === 'forward') {
									window.history.pushState(null, '', finalPath);
								} else if (finalPath !== requestedUrl) {
									window.history.replaceState(null, '', finalPath);
								}
							},
							commitPageData: (moduleUrl, props) => {
								window.__ECO_PAGES__ = window.__ECO_PAGES__ || {};
								window.__ECO_PAGES__.page = {
									module: moduleUrl,
									props,
								};
							},
							setCurrentPage,
							waitForRender,
							runInReactTransition: (update) => {
								startTransition(update);
							},
							startViewTransition:
								!skipViewTransition && options.viewTransitions && document.startViewTransition
									? (update) =>
											new Promise<void>((resolve) => {
												document.startViewTransition(async () => {
													try {
														await update();
													} finally {
														if (
															isStale() &&
															pendingRenderRef.current?.navigationId === navigationId
														) {
															pendingRenderRef.current.resolve();
															pendingRenderRef.current = null;
														}
														resolve();
													}
												});
											})
									: undefined,
							onCommittedPath: (finalPath) => {
								committedPathRef.current = finalPath;
							},
						},
						{ skipViewTransition, isPopState },
					);
					return;
				}

				await applyHandoffNavigation(outcome, {
					isStale,
					requestHandoff: (request) =>
						navigationRuntime.requestHandoff({
							...request,
							source: 'react-router',
							targetOwner: 'browser-router',
						}),
					hardAssign: (href) => {
						window.location.assign(href);
					},
				});
			} finally {
				if (!isStale()) {
					isNavigatingRef.current = false;
					setIsNavigating(false);
				}

				const shouldReplayQueuedNavigation = activeNavigationRef.current?.id === navigationId;
				const queuedNavigationHref = shouldReplayQueuedNavigation ? queuedNavigationHrefRef.current : null;
				const replay = decideQueuedNavigationReplay({
					queuedHref: queuedNavigationHref,
					committedPath: committedPathRef.current,
					runtimeActive: runtimeActiveRef.current,
				});

				navigation.complete();
				if (activeNavigationRef.current?.id === navigationId) {
					activeNavigationRef.current = null;
				}

				if (replay.kind !== 'none') {
					queuedNavigationHrefRef.current = null;

					if (replay.kind === 'local-navigate') {
						void navigate(replay.href, { pushHistory: true });
					} else {
						// React finished after cleanup-before-handoff released ownership.
						// Replay through the coordinator so the active owner receives the intent.
						void navigationRuntime
							.requestNavigation({
								href: replay.href,
								direction: 'forward',
								source: 'react-router',
							})
							.then((handled) => {
								if (!handled) {
									window.location.assign(replay.href);
								}
							});
					}
				}
			}
		},
		[options.viewTransitions],
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
			queuedNavigationHrefRef.current = link.getAttribute('href')!;
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
			navigate(recoveredUrl.pathname + recoveredUrl.search, { pushHistory: true });
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
		const href = link.getAttribute('href')!;
		const url = new URL(href, window.location.origin);

		if (options.debug) {
			console.debug('[EcoRouter] Intercepting navigation:', url.pathname + url.search);
		}

		navigate(url.pathname + url.search, { pushHistory: true });
	});

	const handlePopState = useEffectEvent(() => {
		if (!runtimeActiveRef.current) {
			return;
		}

		navigate(window.location.pathname + window.location.search, { isPopState: true });
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
		{ value: { navigate, isNavigating } },
		createElement(
			PersistLayoutsContext.Provider,
			{ value: options.persistLayouts },
			createElement(PageContext.Provider, { value: currentPage }, children),
		),
	);
};
