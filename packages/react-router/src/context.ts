/**
 * Router context and hook for accessing navigation state.
 * @module
 */

import { createContext, useContext } from 'react';

export type RouterContextValue = {
	navigate: (url: string) => void;
	isPending: boolean;
};

export const RouterContext = createContext<RouterContextValue | null>(null);

/**
 * Hook to access the router's navigate function and pending state.
 * Must be used within an EcoReactRouter.
 *
 * @throws Error if used outside of EcoReactRouter
 */
export const useRouter = (): RouterContextValue => {
	const context = useContext(RouterContext);
	if (!context) throw new Error('useRouter must be used within EcoReactRouter');
	return context;
};
