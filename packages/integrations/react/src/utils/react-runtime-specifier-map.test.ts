import { describe, expect, it } from 'vitest';
import type { ReactRouterAdapter } from '../router-adapter.ts';
import {
	buildReactRuntimeAliasMap,
	getReactClientGraphAllowSpecifiers,
	getReactRuntimeExternalSpecifiers,
	REACT_RUNTIME_SPECIFIERS,
} from './react-runtime-alias-map.ts';

const reactRouterAdapter: ReactRouterAdapter = {
	name: 'react-router',
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

describe('buildReactRuntimeAliasMap', () => {
	it('builds the canonical React runtime alias map', () => {
		expect(
			buildReactRuntimeAliasMap({
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

	it('keeps the runtime alias map scoped to React runtime modules', () => {
		expect(
			buildReactRuntimeAliasMap({
				react: '/assets/vendors/react.js',
				reactDomClient: '/assets/vendors/react-dom.js',
				reactJsxRuntime: '/assets/vendors/react.js',
				reactJsxDevRuntime: '/assets/vendors/react.js',
				reactDom: '/assets/vendors/react-dom.js',
				router: '/assets/vendors/router.js',
			}),
		).not.toHaveProperty('/router.ts');
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
			'/router.ts',
			'virtual:runtime-a',
			'virtual:runtime-b',
		]);
	});
});
