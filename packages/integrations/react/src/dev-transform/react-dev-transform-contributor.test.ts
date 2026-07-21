import { describe, expect, it } from 'vitest';
import { createBrowserRuntimeManifest } from '@ecopages/core/build/browser-runtime-manifest';
import type { DefaultHmrContext } from '@ecopages/core';
import { ReactDevTransformContributor } from './react-dev-transform-contributor.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';

const runtimeManifest = createBrowserRuntimeManifest([
	{
		specifier: 'react',
		owner: '@ecopages/react',
		importPath: 'react',
		publicPath: '/assets/vendors/react.development.js',
	},
	{
		specifier: '@ecopages/react-router',
		owner: '@ecopages/react-router',
		importPath: '@ecopages/react-router/browser',
		publicPath: '/assets/vendors/ecopages-react-router.development.js',
	},
]);

function createStrategy(): ReactHmrStrategy {
	return new ReactHmrStrategy({
		context: {
			getWatchedFiles: () => new Map(),
			getRegisteredEntrypoints: () => new Map(),
			getSrcDir: () => '/tmp/src',
			getLayoutsDir: () => '/tmp/src/layouts',
			getPagesDir: () => '/tmp/src/pages',
			getEntrypointDependencyGraph: () => ({
				supportsSelectiveInvalidation: () => true,
				getDependencyEntrypoints: () => new Set(),
				setEntrypointDependencies: () => {},
				clearEntrypointDependencies: () => {},
				reset: () => {},
			}),
			importServerModule: async () => ({}),
		} as DefaultHmrContext,
		pageMetadataCache: new HmrPageMetadataCache(),
		runtimeManifest,
	});
}

describe('ReactDevTransformContributor', () => {
	it('supplies runtime specifier map and vendor bundle plugins for the browser boundary', async () => {
		const contributor = new ReactDevTransformContributor({ strategy: createStrategy() });

		const runtimeSpecifierMap = contributor.getRuntimeSpecifierMap();
		expect(runtimeSpecifierMap.get('react')).toBe('/assets/vendors/react.development.js');
		expect(runtimeSpecifierMap.get('@ecopages/react-router')).toBe(
			'/assets/vendors/ecopages-react-router.development.js',
		);

		const vendorPlugins = await contributor.getVendorBundlePlugins();
		expect(vendorPlugins.length).toBeGreaterThan(0);
		expect(vendorPlugins.some((plugin) => plugin.name?.includes('client-graph'))).toBe(true);
	});
});
