import { describe, expect, it } from 'vitest';
import type { ReactRouterAdapter } from '../contracts/router-adapter.ts';
import {
	buildReactRuntimeManifest,
	buildReactRuntimeAliasMap,
	getReactClientGraphAllowSpecifiers,
	getReactRuntimeExternalSpecifiers,
	REACT_RUNTIME_SPECIFIERS,
} from './runtime-alias-map.ts';

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
	it('builds the canonical React runtime manifest', () => {
		const manifest = buildReactRuntimeManifest({
			react: '/assets/vendors/react.js',
			reactDomClient: '/assets/vendors/react-dom.js',
			reactJsxRuntime: '/assets/vendors/react.js',
			reactJsxDevRuntime: '/assets/vendors/react.js',
			reactDom: '/assets/vendors/react-dom.js',
			useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
		});

		expect(Array.from(manifest.bySpecifier.entries())).toEqual([
			[
				'react',
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: '/assets/vendors/react.js',
					externals: [],
				},
			],
			[
				'react/jsx-runtime',
				{
					specifier: 'react/jsx-runtime',
					owner: '@ecopages/react',
					importPath: 'react/jsx-runtime',
					publicPath: '/assets/vendors/react.js',
					externals: [],
				},
			],
			[
				'react/jsx-dev-runtime',
				{
					specifier: 'react/jsx-dev-runtime',
					owner: '@ecopages/react',
					importPath: 'react/jsx-dev-runtime',
					publicPath: '/assets/vendors/react.js',
					externals: [],
				},
			],
			[
				'react-dom',
				{
					specifier: 'react-dom',
					owner: '@ecopages/react',
					importPath: 'react-dom',
					publicPath: '/assets/vendors/react-dom.js',
					externals: [],
				},
			],
			[
				'react-dom/client',
				{
					specifier: 'react-dom/client',
					owner: '@ecopages/react',
					importPath: 'react-dom/client',
					publicPath: '/assets/vendors/react-dom.js',
					externals: [],
				},
			],
			[
				'use-sync-external-store/shim',
				{
					specifier: 'use-sync-external-store/shim',
					owner: '@ecopages/react',
					importPath: 'use-sync-external-store/shim',
					publicPath: '/assets/vendors/react.js',
					externals: [],
				},
			],
			[
				'use-sync-external-store/shim/index.js',
				{
					specifier: 'use-sync-external-store/shim/index.js',
					owner: '@ecopages/react',
					importPath: 'use-sync-external-store/shim/index.js',
					publicPath: '/assets/vendors/react.js',
					externals: [],
				},
			],
			[
				'use-sync-external-store/shim/with-selector',
				{
					specifier: 'use-sync-external-store/shim/with-selector',
					owner: '@ecopages/react',
					importPath: 'use-sync-external-store/shim/with-selector',
					publicPath: '/assets/vendors/use-sync-external-store-with-selector.js',
					externals: [],
				},
			],
			[
				'use-sync-external-store/shim/with-selector.js',
				{
					specifier: 'use-sync-external-store/shim/with-selector.js',
					owner: '@ecopages/react',
					importPath: 'use-sync-external-store/shim/with-selector.js',
					publicPath: '/assets/vendors/use-sync-external-store-with-selector.js',
					externals: [],
				},
			],
		]);
	});

	it('builds the canonical React runtime alias map', () => {
		expect(
			buildReactRuntimeAliasMap({
				react: '/assets/vendors/react.js',
				reactDomClient: '/assets/vendors/react-dom.js',
				reactJsxRuntime: '/assets/vendors/react.js',
				reactJsxDevRuntime: '/assets/vendors/react.js',
				reactDom: '/assets/vendors/react-dom.js',
				useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
			}),
		).toEqual({
			react: '/assets/vendors/react.js',
			'react/jsx-runtime': '/assets/vendors/react.js',
			'react/jsx-dev-runtime': '/assets/vendors/react.js',
			'react-dom': '/assets/vendors/react-dom.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
			'use-sync-external-store/shim': '/assets/vendors/react.js',
			'use-sync-external-store/shim/index.js': '/assets/vendors/react.js',
			'use-sync-external-store/shim/with-selector': '/assets/vendors/use-sync-external-store-with-selector.js',
			'use-sync-external-store/shim/with-selector.js': '/assets/vendors/use-sync-external-store-with-selector.js',
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
				useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
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
