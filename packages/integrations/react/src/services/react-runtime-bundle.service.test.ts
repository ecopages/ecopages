import { afterEach, describe, expect, it } from 'vitest';
import { ReactRuntimeBundleService } from './react-runtime-bundle.service.ts';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe('ReactRuntimeBundleService', () => {
	it('uses production vendor asset names outside development mode', () => {
		process.env.NODE_ENV = 'production';
		const service = new ReactRuntimeBundleService({});

		expect(service.getRuntimeImports()).toEqual({
			react: '/assets/vendors/react.js',
			reactDomClient: '/assets/vendors/react-dom.js',
			reactJsxRuntime: '/assets/vendors/react.js',
			reactJsxDevRuntime: '/assets/vendors/react.js',
			reactDom: '/assets/vendors/react-dom.js',
		});
	});

	it('uses development vendor asset names in development mode', () => {
		process.env.NODE_ENV = 'development';
		const service = new ReactRuntimeBundleService({
			routerAdapter: {
				name: 'react-router',
				importMapKey: 'react-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '/router.ts',
					externals: [],
				},
				components: {
					router: 'Router',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		expect(service.getRuntimeImports()).toEqual({
			react: '/assets/vendors/react.development.js',
			reactDomClient: '/assets/vendors/react-dom.development.js',
			reactJsxRuntime: '/assets/vendors/react.development.js',
			reactJsxDevRuntime: '/assets/vendors/react.development.js',
			reactDom: '/assets/vendors/react-dom.development.js',
			router: '/assets/vendors/react-router-esm.development.js',
		});

		const dependencies = service.getDependencies();
		expect(dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'react',
					importPath: expect.any(String),
					bundleOptions: expect.objectContaining({
						naming: 'react.js',
						define: expect.objectContaining({ 'process.env.NODE_ENV': '"production"' }),
					}),
				}),
				expect.objectContaining({
					name: 'react',
					importPath: expect.any(String),
					bundleOptions: expect.objectContaining({
						naming: 'react.development.js',
						define: expect.objectContaining({ 'process.env.NODE_ENV': '"development"' }),
					}),
				}),
				expect.objectContaining({
					name: 'react-router-esm',
					importPath: '/router.ts',
					bundleOptions: expect.objectContaining({ naming: 'react-router-esm.js' }),
				}),
				expect.objectContaining({
					name: 'react-router-esm',
					importPath: '/router.ts',
					bundleOptions: expect.objectContaining({ naming: 'react-router-esm.development.js' }),
				}),
			]),
		);
	});

	it('re-evaluates vendor asset names when the runtime mode changes after construction', () => {
		process.env.NODE_ENV = 'production';
		const service = new ReactRuntimeBundleService({});

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.js');

		process.env.NODE_ENV = 'development';

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.development.js');
		expect(service.getRuntimeImports().reactDomClient).toBe('/assets/vendors/react-dom.development.js');
	});
});
