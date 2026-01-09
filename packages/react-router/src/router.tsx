/**
 * Root router component that enables SPA navigation.
 * @module
 */

import {
	useEffect,
	useState,
	useTransition,
	useCallback,
	useMemo,
	createContext,
	useContext,
	type ReactNode,
	type ComponentType,
} from 'react';
import { type EcoReactRouterOptions, DEFAULT_OPTIONS } from './types';
import { RouterContext } from './context';
import { type PageState, componentCache, loadPageModule, shouldInterceptClick } from './navigation';

type PageContextValue = PageState | null;

const PageContext = createContext<PageContextValue>(null);

export interface EcoRouterProps {
	/** The page component to render on initial load (from SSR) */
	page: ComponentType<any>;

	/** The props to pass to the page (from SSR) */
	pageProps: Record<string, any>;

	/** Router configuration options */
	options?: EcoReactRouterOptions;

	/** Children - typically the Layout wrapping <PageContent /> */
	children: ReactNode;
}

/**
 * Renders the current page content.
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

	const [isPending, startTransition] = useTransition();

	const navigate = useCallback(async (url: string) => {
		if (componentCache.has(url)) {
			startTransition(() => setCurrentPage(componentCache.get(url)!));
			return;
		}

		const newPage = await loadPageModule(url);
		if (newPage) {
			componentCache.set(url, newPage);
			startTransition(() => setCurrentPage(newPage));
		} else {
			window.location.href = url;
		}
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
		<RouterContext.Provider value={{ navigate, isPending }}>
			<PageContext.Provider value={currentPage}>
				<div style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s' }}>{children}</div>
			</PageContext.Provider>
		</RouterContext.Provider>
	);
};

export interface EcoReactRouterProps {
	/** The component to render on initial load (from SSR) */
	initialComponent: ComponentType<any>;

	/** The props to pass to the initial component (from SSR) */
	initialProps: Record<string, any>;

	/** Render function that receives the current page state */
	children: (current: PageState) => ReactNode;

	/** Router configuration options */
	options?: EcoReactRouterOptions;
}

/**
 * @deprecated Use EcoRouter with config.layout instead.
 * Legacy router component with render prop pattern.
 */
export const EcoReactRouter = ({
	initialComponent,
	initialProps,
	children,
	options: userOptions,
}: EcoReactRouterProps) => {
	const options = useMemo(() => ({ ...DEFAULT_OPTIONS, ...userOptions }), [userOptions]);

	const [page, setPage] = useState<PageState>({
		Component: initialComponent,
		props: initialProps,
	});

	const [isPending, startTransition] = useTransition();

	const navigate = useCallback(async (url: string) => {
		if (componentCache.has(url)) {
			startTransition(() => setPage(componentCache.get(url)!));
			return;
		}

		const newPage = await loadPageModule(url);
		if (newPage) {
			componentCache.set(url, newPage);
			startTransition(() => setPage(newPage));
		} else {
			window.location.href = url;
		}
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
		<RouterContext.Provider value={{ navigate, isPending }}>
			<body>
				<div style={{ opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s' }}>{children(page)}</div>
			</body>
		</RouterContext.Provider>
	);
};
