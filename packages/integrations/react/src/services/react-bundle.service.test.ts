import { describe, expect, it } from 'vitest';
import { ReactBundleService } from './react-bundle.service.ts';

describe('ReactBundleService', () => {
	it('does not include the Eco core browser shim in client bundle options', async () => {
		const service = new ReactBundleService({
			rootDir: '/app',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, []);
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);
		const runtimeImports = service.getRuntimeImports();

		expect(pluginNames).not.toContain('react-renderer-eco-core-browser-shim');
		expect(pluginNames).toContain('ecopages-client-graph-boundary');
		expect(options.external).toEqual(
			expect.arrayContaining([
				...Object.values(runtimeImports),
				'react',
				'react-dom',
				'react-dom/client',
			]),
		);
	});

	it('can bundle runtime specifiers directly into page-owned entries', async () => {
		const service = new ReactBundleService({
			rootDir: '/app',
			routerAdapter: {
				name: 'eco-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser',
					externals: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
				},
				components: {
					router: 'EcoRouter',
					pageContent: 'PageContent',
				},
				getRouterProps: () => '{}',
			},
		});

		const options = await service.createBundleOptions('ecopages-react-page', false, [], {
			includeRuntime: true,
		});
		const pluginNames = (options.plugins as Array<{ name: string }>).map((plugin) => plugin.name);

		expect(options.external).toBeUndefined();
		expect(pluginNames).not.toContain('react-runtime-import-alias');
	});
});
