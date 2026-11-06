import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { copyFixtureApp } from '../../../../core/__fixtures__/app/copy-fixture-app.ts';
import { RuntimeBundleService } from './runtime-bundle.ts';

const fixtureAppRoot = copyFixtureApp();

afterAll(() => {
	rmSync(fixtureAppRoot, { recursive: true, force: true });
});

describe('RuntimeBundleService', () => {
	it('uses production vendor asset names outside development mode', () => {
		vi.stubEnv('NODE_ENV', 'production');
		const service = new RuntimeBundleService({ rootDir: fixtureAppRoot });

		expect(service.getRuntimeImports()).toEqual({
			react: '/assets/vendors/react.js',
			reactDomClient: '/assets/vendors/react-dom.js',
			reactJsxRuntime: '/assets/vendors/react.js',
			reactJsxDevRuntime: '/assets/vendors/react.js',
			reactDom: '/assets/vendors/react-dom.js',
			useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.js',
			pageLayoutNormalization: '/assets/vendors/page-layout-normalization.js',
			layoutCompose: '/assets/vendors/layout-compose.js',
		});

		const dependencies = service.getDependencies();
		expect(dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'react',
					bundleOptions: expect.objectContaining({
						naming: 'react.js',
						define: expect.objectContaining({ 'process.env.NODE_ENV': '"production"' }),
					}),
				}),
				expect.objectContaining({
					name: 'react-dom',
					bundleOptions: expect.objectContaining({
						naming: 'react-dom.js',
					}),
				}),
			]),
		);
		expect(
			dependencies.some((dependency) =>
				String((dependency as { bundleOptions?: { naming?: string } }).bundleOptions?.naming).includes(
					'.development.',
				),
			),
		).toBe(false);
	});

	it('uses development vendor asset names in development mode', () => {
		vi.stubEnv('NODE_ENV', 'development');
		const service = new RuntimeBundleService({
			rootDir: fixtureAppRoot,
			routerAdapter: {
				name: 'react-router',
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
			useSyncExternalStoreWithSelector: '/assets/vendors/use-sync-external-store-with-selector.development.js',
			pageLayoutNormalization: '/assets/vendors/page-layout-normalization.development.js',
			layoutCompose: '/assets/vendors/layout-compose.development.js',
			router: '/assets/vendors/react-router-esm.development.js',
		});

		const dependencies = service.getDependencies();
		expect(dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'use-sync-external-store-with-selector',
					importPath: '@ecopages/react/runtime/use-sync-external-store-with-selector',
					bundleOptions: expect.objectContaining({
						naming: 'use-sync-external-store-with-selector.development.js',
						define: expect.objectContaining({ 'process.env.NODE_ENV': '"development"' }),
					}),
				}),
				expect.objectContaining({
					name: 'layout-compose',
					importPath: '@ecopages/react/layout-compose',
					bundleOptions: expect.objectContaining({
						naming: 'layout-compose.development.js',
						plugins: expect.any(Array),
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
					bundleOptions: expect.objectContaining({ naming: 'react-router-esm.development.js' }),
				}),
			]),
		);
		expect(
			dependencies.some((dependency) => 'name' in dependency && dependency.name === 'page-layout-normalization'),
		).toBe(false);
		expect(service.getPageLayoutNormalizationDependencies()).toEqual([
			expect.objectContaining({
				name: 'page-layout-normalization',
				importPath: '@ecopages/core/client',
				bundleOptions: expect.objectContaining({
					naming: 'page-layout-normalization.development.js',
				}),
			}),
		]);
		expect(
			dependencies.some(
				(dependency) =>
					String((dependency as { bundleOptions?: { naming?: string } }).bundleOptions?.naming).endsWith(
						'.js',
					) &&
					!String((dependency as { bundleOptions?: { naming?: string } }).bundleOptions?.naming).includes(
						'.development.',
					),
			),
		).toBe(false);
	});

	it('re-evaluates vendor asset names when the runtime mode changes after construction', () => {
		vi.stubEnv('NODE_ENV', 'production');
		const service = new RuntimeBundleService({ rootDir: fixtureAppRoot });

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.js');

		vi.stubEnv('NODE_ENV', 'development');

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.development.js');
		expect(service.getRuntimeImports().reactDomClient).toBe('/assets/vendors/react-dom.development.js');
	});
});
