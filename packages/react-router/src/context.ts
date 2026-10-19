/**
 * Router context and hook for accessing navigation state.
 * @module
 */

import { createContext, useContext } from 'react';

/** Options for programmatic navigation through `useRouter().navigate`. */
export type RouterNavigateRequestOptions = {
	/** Replaces the current history entry instead of pushing a new one. */
	replace?: boolean;
};

export type RouterContextValue = {
	/**
	 * Navigates to a URL and pushes a history entry, like following a link.
	 *
	 * @remarks
	 * Pass `{ replace: true }` to replace the current entry instead.
	 */
	navigate: (url: string, options?: RouterNavigateRequestOptions) => Promise<void>;
	isNavigating: boolean;
};

export const RouterContext = createContext<RouterContextValue | null>(null);

/**
 * Hook to access the router's navigate function and navigation state.
 * Must be used within an EcoRouter.
 *
 * @throws Error if used outside of EcoRouter
 */
export const useRouter = (): RouterContextValue => {
	const context = useContext(RouterContext);
	if (!context) throw new Error('useRouter must be used within EcoRouter');
	return context;
};
