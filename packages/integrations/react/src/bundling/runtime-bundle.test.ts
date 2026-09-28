import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getBrowserRuntimeManifestFromPlugin } from '@ecopages/core/build/browser-runtime-plugin';
import { RuntimeBundleService } from './runtime-bundle.ts';
import { resolveReactPluginRuntimeModules, UnmappedReactRuntimeModuleExternalError } from './runtime-modules.ts';

const originalNodeEnv = process.env.NODE_ENV;
const fixtureAppRoot = path.resolve(import.meta.dirname, '../../../../core/__fixtures__/app');

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe('RuntimeBundleService', () => {
	it('uses production vendor asset names outside development mode', () => {
		process.env.NODE_ENV = 'production';
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
		process.env.NODE_ENV = 'development';
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
				importPath: '@ecopages/core/eco/page-layout-normalization',
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
		process.env.NODE_ENV = 'production';
		const service = new RuntimeBundleService({ rootDir: fixtureAppRoot });

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.js');

		process.env.NODE_ENV = 'development';

		expect(service.getRuntimeImports().react).toBe('/assets/vendors/react.development.js');
		expect(service.getRuntimeImports().reactDomClient).toBe('/assets/vendors/react-dom.development.js');
	});

	it('registers configured runtime modules as shared browser vendors', () => {
		process.env.NODE_ENV = 'development';
		const service = new RuntimeBundleService({
			rootDir: fixtureAppRoot,
			runtimeModules: resolveReactPluginRuntimeModules(['@mdx-js/mdx']),
		});

		expect(service.getConfiguredRuntimeModuleSpecifiers()).toEqual(['@mdx-js/mdx']);
		expect(service.getRuntimeManifest().bySpecifier.get('@mdx-js/mdx')).toEqual({
			specifier: '@mdx-js/mdx',
			owner: '@ecopages/react',
			importPath: '@mdx-js/mdx',
			publicPath: '/assets/vendors/mdx-js-mdx.development.js',
			externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
		});
		expect(service.getRuntimeAliasMap()['@mdx-js/mdx']).toBe('/assets/vendors/mdx-js-mdx.development.js');

		const dependencies = service.getDependencies();
		const mdxAsset = dependencies.find((dependency) => 'name' in dependency && dependency.name === 'mdx-js-mdx');
		expect(mdxAsset).toEqual(
			expect.objectContaining({
				name: 'mdx-js-mdx',
				bundleOptions: expect.objectContaining({
					naming: 'mdx-js-mdx.development.js',
					external: expect.any(Array),
					plugins: expect.any(Array),
				}),
			}),
		);
		if (!mdxAsset || mdxAsset.kind !== 'script') {
			throw new Error('expected mdx-js-mdx script asset');
		}

		const mdxPlugin = mdxAsset.bundleOptions?.plugins?.[0];
		expect(mdxPlugin).toBeDefined();
		const mdxManifest = getBrowserRuntimeManifestFromPlugin(mdxPlugin!);
		expect(mdxManifest?.bySpecifier.has('@mdx-js/mdx')).toBe(false);
		expect(mdxManifest?.bySpecifier.has('react')).toBe(true);
		expect(mdxAsset.bundleOptions?.external).not.toContain('react');
	});

	it('rewrites sibling runtime modules when a library vendor lists them as externals', () => {
		process.env.NODE_ENV = 'development';
		const service = new RuntimeBundleService({
			rootDir: fixtureAppRoot,
			runtimeModules: resolveReactPluginRuntimeModules([
				{ specifier: 'mobx', outputName: 'mobx' },
				{ specifier: '@acme/ui', outputName: 'acme-ui', externals: ['mobx'] },
			]),
		});

		expect(service.getRuntimeAliasMap().mobx).toBe('/assets/vendors/mobx.development.js');

		const libraryManifest = getBrowserRuntimeManifestFromPlugin(
			service.createRuntimeAliasPlugin('development', ['@acme/ui']),
		);
		expect(libraryManifest?.bySpecifier.get('mobx')?.publicPath).toBe('/assets/vendors/mobx.development.js');
		expect(libraryManifest?.bySpecifier.has('@acme/ui')).toBe(false);

		const mobxManifest = getBrowserRuntimeManifestFromPlugin(
			service.createRuntimeAliasPlugin('development', ['mobx']),
		);
		expect(mobxManifest?.bySpecifier.has('mobx')).toBe(false);
		expect(mobxManifest?.bySpecifier.get('@acme/ui')?.publicPath).toBe('/assets/vendors/acme-ui.development.js');
	});

	it('throws when a runtime module external is not a shared vendor', () => {
		process.env.NODE_ENV = 'development';
		const service = new RuntimeBundleService({
			rootDir: fixtureAppRoot,
			runtimeModules: resolveReactPluginRuntimeModules([
				{ specifier: '@acme/ui', outputName: 'acme-ui', externals: ['webmidi'] },
			]),
		});

		expect(() => service.getDependencies()).toThrow(UnmappedReactRuntimeModuleExternalError);
		expect(() => service.getDependencies()).toThrow(/webmidi/);
	});
});
