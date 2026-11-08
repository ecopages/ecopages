/**
 * Router adapter interface for React integration.
 * Allows pluggable SPA routers to be used with the React plugin.
 * @module
 */

/**
 * Configuration for a React router adapter.
 * Implement this interface to create custom router integrations.
 *
 * @example
 * ```ts
 * const myRouter: ReactRouterAdapter = {
 *   name: 'my-router',
 *   importPath: '@my/router/browser',
 *   components: {
 *     router: 'MyRouter',
 *     pageContent: 'PageOutlet',
 *   },
 *   getRouterProps: (page, props) => `{ page: ${page}, pageProps: ${props} }`,
 * };
 * ```
 */
export interface ReactRouterAdapter {
	/**
	 * Unique identifier for caching and debugging.
	 */
	name: string;

	/**
	 * Package specifier of the router's browser entry, which page bootstraps import.
	 *
	 * @remarks
	 * It resolves like any other package: production bundles it into the app-wide build and development serves it
	 * from the vendor graph, so it shares React with the Pages.
	 *
	 * @example '@ecopages/react-router/browser'
	 */
	importPath: string;

	/**
	 * Component names to import from the router package.
	 */
	components: {
		/**
		 * The router component that wraps the layout.
		 * @example 'MyRouter'
		 */
		router: string;

		/**
		 * The component that renders the current page content.
		 * @example 'PageOutlet'
		 */
		pageContent: string;
	};

	/**
	 * Generate the props object for the router component.
	 * @param page - Variable name holding the page component
	 * @param props - Variable name holding the page props
	 * @returns Code string for the router props
	 * @example
	 * ```ts
	 * getRouterProps: (page, props) => `{ page: ${page}, pageProps: ${props} }`
	 * // Results in: { page: Component, pageProps: props }
	 * ```
	 */
	getRouterProps(page: string, props: string): string;
}
