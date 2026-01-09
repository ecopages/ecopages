/**
 * Root router component that enables SPA navigation.
 * @module
 */

import {
	useEffect,
	useState,
	useCallback,
	useMemo,
	createContext,
	useContext,
	type ReactNode,
	type ComponentType,
} from 'react';
import { flushSync } from 'react-dom';
import { type EcoRouterOptions, DEFAULT_OPTIONS } from './types';
import { RouterContext } from './context';
import { type PageState, loadPageModule, shouldInterceptClick } from './navigation';
import { withViewTransition } from './view-transition-manager';
import { morphHead } from './head-morpher';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);

export interface EcoRouterProps {
	/** The page component to render on initial load (from SSR) */
	page: ComponentType<any>;

	/** The props to pass to the page (from SSR) */
	pageProps: Record<string, any>;

	/** Router configuration options */
	options?: EcoRouterOptions;

	/** Children - typically the Layout wrapping <PageContent /> */
	children: ReactNode;
}

/**
 * Renders the current page content with view transitions.
 * Use this inside your layout to render the page.
 *
 * @example
 * ```tsx
 * const Layout = ({ children }) => (
 *   <main>
 *     <Header />
 *     {children}
 *   </main>
 * );
 *
 * // In the page with config.layout = Layout
 * // The page content will be passed as children to the Layout
 * ```
 */
export const PageContent = () => {
	const pageContext = useContext(PageContext);
	if (!pageContext) {
		console.warn('[EcoRouter] PageContent used outside of EcoRouter');
		return null;
	}
	const { Component, props } = pageContext;
	return <Component {...props} />;
};

/**
 * Root router component that enables SPA navigation.
 * Wraps your layout and manages page state.
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
export const EcoRouter = ({ page, pageProps, options: userOptions, children }: EcoRouterProps) => {
	const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...userOptions }), [userOptions]);

	const [currentPage, setCurrentPage] = useState<PageState>({
		Component: page,
		props: pageProps,
	});

	const [isNavigating, setIsNavigating] = useState(false);

	const navigate = useCallback(async (url: string) => {
		setIsNavigating(true);
		const result = await loadPageModule(url);
		if (result) {
			const { Component, props, doc } = result;
			/**
			 * View Transition Flow:
			 * 1. loadPageModule fetches the new page (pure, no side effects yet).
			 * 2. withViewTransition starts. Use pure CSS or UA snapshots for "Old State".
			 * 3. Inside the callback:
			 *    - morphHead(doc): Updates <head> (CSS/Scripts). Critical to do this HERE so "New State" includes new styles.
			 *    - flushSync: Renders the new React component synchronously.
			 * 4. Transition animates from Old State -> New State.
			 *
			 * It is important to apply new styles *after* the snapshot is taken but *before* the new content renders
			 * Then we flushSync to render the new page content to ensure the DOM is ready for the "New State" snapshot
			 */
			await withViewTransition(async () => {
				await morphHead(doc);
				flushSync(() => setCurrentPage({ Component, props }));
			});
		} else {
			window.location.href = url;
		}
		setIsNavigating(false);
	}, []);

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
