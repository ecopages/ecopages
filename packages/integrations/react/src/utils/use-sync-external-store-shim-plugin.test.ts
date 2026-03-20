import { describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/build/build-types';
import { createUseSyncExternalStoreShimPlugin } from './use-sync-external-store-shim-plugin.ts';

type OnResolveRegistration = {
	options: { filter: RegExp; namespace?: string };
	callback: (
		args: EcoBuildOnResolveArgs,
	) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
};

type OnLoadRegistration = {
	options: { filter: RegExp; namespace?: string };
	callback: (
		args: EcoBuildOnLoadArgs,
	) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;
};

function createPluginHarness() {
	const onResolveRegistrations: OnResolveRegistration[] = [];
	const onLoadRegistrations: OnLoadRegistration[] = [];
	const builder: EcoBuildPluginBuilder = {
		onResolve: (options, callback) => {
			onResolveRegistrations.push({ options, callback });
		},
		onLoad: (options, callback) => {
			onLoadRegistrations.push({ options, callback });
		},
		module: (_specifier, _callback) => {},
	};

	const plugin = createUseSyncExternalStoreShimPlugin({
		name: 'react-hmr-use-sync-external-store-shim',
		namespace: 'ecopages-react-hmr-shim',
	});
	plugin.setup(builder);

	return { onResolveRegistrations, onLoadRegistrations };
}

describe('createUseSyncExternalStoreShimPlugin', () => {
	it('redirects the bare shim specifier into a synthetic namespace', async () => {
		const harness = createPluginHarness();
		const resolveRegistration = harness.onResolveRegistrations.find(({ options }) =>
			options.filter.test('use-sync-external-store/shim'),
		);

		expect(resolveRegistration).toBeDefined();
		const result = await resolveRegistration?.callback({
			path: 'use-sync-external-store/shim',
			importer: '/app/entry.tsx',
			namespace: 'file',
		});

		expect(result).toEqual({
			path: 'use-sync-external-store/shim',
			namespace: 'ecopages-react-hmr-shim',
		});
	});

	it('rewrites shim module variants to a direct React re-export', async () => {
		const harness = createPluginHarness();
		const loadRegistration = harness.onLoadRegistrations.find(
			({ options }) => options.namespace === 'ecopages-react-hmr-shim',
		);

		expect(loadRegistration).toBeDefined();
		const syntheticResult = await loadRegistration?.callback({
			path: 'use-sync-external-store/shim',
			namespace: 'ecopages-react-hmr-shim',
		});

		expect(syntheticResult).toEqual({
			contents: "export { useSyncExternalStore } from 'react';",
			loader: 'js',
		});

		for (const variantPath of [
			'/workspace/node_modules/use-sync-external-store/shim/index.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.development.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js',
		]) {
			const variantRegistration = harness.onLoadRegistrations.find(({ options }) => options.filter.test(variantPath));
			expect(variantRegistration).toBeDefined();
			const variantResult = await variantRegistration?.callback({ path: variantPath, namespace: 'file' });
			expect(variantResult).toEqual({
				contents: "export { useSyncExternalStore } from 'react';",
				loader: 'js',
			});
		}
	});
});