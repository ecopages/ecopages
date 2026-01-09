/**
 * Router adapter for React integration.
 * @module
 */

import type { ReactRouterAdapter } from '@ecopages/react/router-adapter';

/**
 * Creates a ReactRouterAdapter for EcoPages React Router.
 * Use this with the React plugin to enable SPA navigation.
 *
 * @example
 * ```ts
 * import { reactPlugin } from '@ecopages/react';
 * import { ecoRouter } from '@ecopages/react-router';
 *
 * export default {
 *   integrations: [reactPlugin({ router: ecoRouter() })],
 * };
 * ```
 */
export function ecoRouter(): ReactRouterAdapter {
	return {
		name: 'eco-router',
		bundle: {
			importPath: '@ecopages/react-router/browser.ts',
			outputName: 'react-router-esm',
			externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
		},
		importMapKey: '@ecopages/react-router',
		components: {
			router: 'EcoRouter',
			pageContent: 'PageContent',
		},
		getRouterProps(page: string, props: string): string {
			return `{ page: ${page}, pageProps: ${props} }`;
		},
	};
}
