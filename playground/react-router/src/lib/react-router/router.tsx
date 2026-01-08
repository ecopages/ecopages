/**
 * Root router component that enables SPA navigation.
 * @module
 */

import { useEffect, useState, useTransition, useCallback, useMemo, type ReactNode, type ComponentType } from 'react';
import { type EcoReactRouterOptions, DEFAULT_OPTIONS } from './types';
import { RouterContext } from './context';
import { type PageState, componentCache, loadPageModule, shouldInterceptClick } from './navigation';

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
 * Root router component that enables SPA navigation.
 * Wraps your page content and handles client-side routing.
 *
 * @example
 * ```tsx
 * const Page = (props) => (
 *   <EcoReactRouter initialComponent={Content} initialProps={props}>
 *     {({ Component, props }) => <Component {...props} />}
 *   </EcoReactRouter>
 * );
 * ```
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
