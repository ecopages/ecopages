import { describe, expect, it } from 'vitest';
import type { DefaultHmrContext } from '@ecopages/core/integration';
import { ReactDevTransformContributor } from './react-dev-transform-contributor.ts';
import { HmrPageMetadataCache } from '../hmr/page-metadata-cache.ts';
import { ReactHmrStrategy } from '../hmr/hmr-strategy.ts';

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
	});
}

describe('ReactDevTransformContributor', () => {
	it('supplies the client-graph boundary as a vendor bundle plugin', async () => {
		const contributor = new ReactDevTransformContributor({ strategy: createStrategy() });

		const vendorPlugins = await contributor.getVendorBundlePlugins();
		expect(vendorPlugins.length).toBeGreaterThan(0);
		expect(vendorPlugins.some((plugin) => plugin.name?.includes('client-graph'))).toBe(true);
	});
});
