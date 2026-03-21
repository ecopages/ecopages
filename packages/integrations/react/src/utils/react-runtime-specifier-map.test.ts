import { describe, expect, it } from 'vitest';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import {
	buildReactRuntimeSpecifierMap,
	getReactClientGraphAllowSpecifiers,
	getReactRuntimeExternalSpecifiers,
	REACT_RUNTIME_SPECIFIERS,
} from './react-runtime-specifier-map.ts';

const reactRouterAdapter: ReactRouterAdapter = {
	name: 'react-router',
	importMapKey: 'react-router',
	bundle: {
		outputName: 'router',
		importPath: '/router.ts',
		externals: [],
	},
	components: {
		router: 'Router',
		pageContent: 'PageContent',
	},
	getRouterProps: (page, props) => `{ page: ${page}, pageProps: ${props} }`,
};

describe('buildReactRuntimeSpecifierMap', () => {
	it('builds the canonical React runtime specifier map', () => {
		expect(
			buildReactRuntimeSpecifierMap({
				react: '/assets/vendors/react.js',
				reactDomClient: '/assets/vendors/react-dom.js',
				reactJsxRuntime: '/assets/vendors/react.js',
				reactJsxDevRuntime: '/assets/vendors/react.js',
				reactDom: '/assets/vendors/react-dom.js',
			}),
		).toEqual({
			react: '/assets/vendors/react.js',
			'react/jsx-runtime': '/assets/vendors/react.js',
			'react/jsx-dev-runtime': '/assets/vendors/react.js',
			'react-dom': '/assets/vendors/react-dom.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		});
	});

	it('includes the router specifier when a router adapter is configured', () => {
		expect(
			buildReactRuntimeSpecifierMap(
				{
					react: '/assets/vendors/react.js',
					reactDomClient: '/assets/vendors/react-dom.js',
					reactJsxRuntime: '/assets/vendors/react.js',
					reactJsxDevRuntime: '/assets/vendors/react.js',
					reactDom: '/assets/vendors/react-dom.js',
					router: '/assets/vendors/router.js',
				},
				reactRouterAdapter,
			),
		).toMatchObject({
			'react-router': '/assets/vendors/router.js',
		});
	});

	it('exposes the canonical runtime external specifiers', () => {
		expect(getReactRuntimeExternalSpecifiers()).toEqual([...REACT_RUNTIME_SPECIFIERS]);
	});

	it('builds the canonical allowlist for client graph boundaries', () => {
		expect(
			getReactClientGraphAllowSpecifiers(['virtual:runtime-a', 'virtual:runtime-b'], reactRouterAdapter),
		).toEqual([
			'@ecopages/core',
			'react',
			'react-dom',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
			'react-dom/client',
			'react-router',
			'virtual:runtime-a',
			'virtual:runtime-b',
		]);
	});
});
