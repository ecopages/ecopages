import { describe, expect, it } from 'vitest';
import { ReactBundleService } from './react-bundle.service.ts';

describe('ReactBundleService', () => {
	it('does not include the Eco core browser shim in client bundle options', async () => {
		const service = new ReactBundleService({
			rootDir: '/app',
			routerAdapter: {
				name: 'eco-router',
				importMapKey: '@ecopages/react-router',
				bundle: {
					outputName: 'react-router-esm',
					importPath: '@ecopages/react-router/browser.ts',
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

		expect(pluginNames).not.toContain('react-renderer-eco-core-browser-shim');
		expect(pluginNames).toContain('ecopages-client-graph-boundary');
	});
});
