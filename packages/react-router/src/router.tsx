/**
 * Root router component that enables SPA navigation with View Transitions API support.
 *
 * The router intercepts link clicks and performs client-side navigation using the
 * browser's History API. When the View Transitions API is available, page transitions
 * are animated using CSS view-transition pseudo-elements.
 *
 * @module
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
	type ReactNode,
	type ComponentType,
	type FC,
} from 'react';
import { type EcoRouterOptions, DEFAULT_OPTIONS } from './types';
import { RouterContext } from './context';
import { type PageState, loadPageModule, shouldInterceptClick } from './navigation';
import { morphHead } from './head-morpher';
import { applyViewTransitionNames } from './view-transition-utils';
import { manageScroll } from './manage-scroll';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);

/**
 * Props for the EcoRouter component.
 */
export interface EcoRouterProps {
	/** The page component to render */
	page: ComponentType<any>;
	/** Props to pass to the page component */
	pageProps: Record<string, any>;
	/** Router configuration options */
	options?: EcoRouterOptions;
	/** Children containing the layout (should include PageContent) */
	children: ReactNode;
}

/**
 * Renders the current page content.
 *
 * Must be used inside an EcoRouter component. This is where the actual page
 * component gets rendered based on the current navigation state.
 *
 * @example
 * ```tsx
 * <EcoRouter page={Page} pageProps={props}>
 *   <Layout>
 *     <PageContent />
 *   </Layout>
 * </EcoRouter>
 * ```
 */
export const PageContent: FC = () => {
	const pageContext = useContext(PageContext);
	if (!pageContext) {
		console.warn('[EcoRouter] PageContent used outside of EcoRouter');
		return null;
	}
	const { Component, props } = pageContext;
	return <Component {...props} />;
};

/**
 * Creates a deferred promise that can be resolved externally.
 *
 * Used to synchronize the View Transition callback with React's render cycle.
 * The promise is awaited inside startViewTransition's callback and resolved
 * by a useEffect once React has committed the new page to the DOM.
 *
 * @returns Object with a promise and its resolve function
 */
function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

/**
 * Root router component that provides SPA navigation with View Transitions.
 *
 * Implements the View Transitions API integration using a deferred promise pattern
 * inspired by React Router. This ensures the browser captures the correct DOM
 * snapshot after React has rendered the new page.
 *
 * ## How View Transitions Work
 *
 * 1. When navigation occurs, a deferred promise is created
 * 2. `document.startViewTransition()` is called with an async callback
 * 3. Inside the callback, `React.startTransition()` schedules the state update
 * 4. The callback awaits the deferred promise
 * 5. A `useEffect` resolves the promise once React renders the new page
 * 6. The browser then animates between the old and new DOM snapshots
 *
 * ## Shared Element Transitions
 *
 * Elements with matching `data-view-transition` attributes on both the source
 * and destination pages will animate their position and size between states.
 *
 * @example
 * ```tsx
 * // In your app entry or layout
 * import { EcoRouter, PageContent } from '@ecopages/react-router';
 *
 * <EcoRouter page={CurrentPage} pageProps={pageProps}>
 *   <header>...</header>
 *   <main>
 *     <PageContent />
 *   </main>
 * </EcoRouter>
 * ```
 *
 * @example
 * ```tsx
 * // Shared element transitions
 * // Source page (list)
 * <img data-view-transition={`hero-${item.id}`} src={item.image} />
 *
 * // Destination page (detail)
 * <img data-view-transition={`hero-${id}`} src={image} />
 * ```
 */
export const EcoRouter: FC<EcoRouterProps> = ({ page, pageProps, options: userOptions, children }: EcoRouterProps) => {
	const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...userOptions }), [userOptions]);

	const [currentPage, setCurrentPage] = useState<PageState>({
		Component: page,
		props: pageProps,
	});

	const [isNavigating, setIsNavigating] = useState(false);

	/**
	 * Tracks the pending page during a view transition.
	 * Used to detect when React has finished rendering the new page.
	 */
	const [pendingPage, setPendingPage] = useState<PageState | null>(null);

	/**
	 * Deferred promise that gets resolved when React renders the pending page.
	 * This is the key mechanism that makes View Transitions work with React -
	 * we await this promise inside startViewTransition's callback to ensure
	 * the DOM is updated before the browser captures the "new" snapshot.
	 */
	const renderDfd = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

	/**
	 * Synchronizes the current page state with the router prop updates.
	 * This ensures that HMR updates to the page component are reflected immediately.
	 */
	useEffect(() => {
		setCurrentPage({ Component: page, props: pageProps });
	}, [page, pageProps]);

	/**
	 * Applies view transition names to DOM elements on every page render.
	 * This is necessary because React re-creation of DOM nodes removes custom properties.
	 */
	useEffect(() => {
		applyViewTransitionNames();
	}, [currentPage]);

	/**
	 * Monitors the pending page navigation and resolves the deferred promise
	 * once the new component is mounted. This specific effect is the signal
	 * to the View Transitions API that the DOM update is complete and
	 * the "new" snapshot can be taken.
	 */
	useEffect(() => {
		if (pendingPage && currentPage.Component === pendingPage.Component && renderDfd.current) {
			renderDfd.current.resolve();
			renderDfd.current = null;
			setPendingPage(null);
		}
	}, [currentPage, pendingPage]);

	/**
	 * Tracks the previous URL for scroll behavior management.
	 */
	const previousUrlRef = useRef<string>(typeof window !== 'undefined' ? window.location.href : '');

	/**
	 * Manages scroll position after navigation.
	 */
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
	}, [currentPage, options.scrollBehavior, options.smoothScroll]);

	/**
	 * Navigates to the specified URL using client-side navigation.
	 *
	 * Loads the page module, updates the document head, and transitions
	 * to the new page using the View Transitions API if available.
	 */
	const navigate = useCallback(
		async (url: string) => {
			setIsNavigating(true);
			const result = await loadPageModule(url);

			if (result) {
				const { Component, props, doc } = result;
				const nextPage = { Component, props };

				const cleanupHead = await morphHead(doc);
				applyViewTransitionNames();

				const useViewTransition = options.viewTransitions && document.startViewTransition;

				if (useViewTransition) {
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

	/**
	 * Sets up global event listeners for client-side navigation.
	 * Intercepts clicks on <a> tags and handles popstate events for back/forward navigation.
	 */
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
			navigate(window.location.pathname + window.location.search);
		};

		document.addEventListener('click', handleClick);
		window.addEventListener('popstate', handlePopState);

		return () => {
			document.removeEventListener('click', handleClick);
			window.removeEventListener('popstate', handlePopState);
		};
	}, [navigate, options]);

	return (
		<RouterContext.Provider value={{ navigate, isNavigating }}>
			<PageContext.Provider value={currentPage}>{children}</PageContext.Provider>
		</RouterContext.Provider>
	);
};
