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
 *   bundle: {
 *     importPath: '@my/router/browser',
 *     outputName: 'my-router',
 *     externals: ['react', 'react-dom'],
 *   },
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
	 * Runtime bundle configuration.
	 */
	bundle: {
		/**
		 * Node module import path for the browser-compatible entry.
		 * @example '@ecopages/react-router/browser'
		 */
		importPath: string;

		/**
		 * Output filename (without extension).
		 * @example 'my-router'
		 */
		outputName: string;

		/**
		 * Packages to externalize when bundling.
		 * These should stay as bare runtime dependencies for the router bundle.
		 * @example ['react', 'react-dom']
		 */
		externals: string[];
	};

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
