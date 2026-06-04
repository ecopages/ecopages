import { describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/plugins/integration-plugin';
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
	it('redirects shim specifiers into a synthetic namespace', async () => {
		const harness = createPluginHarness();

		for (const [specifier, expectedPath] of [
			['use-sync-external-store/shim', 'use-sync-external-store/shim'],
			['use-sync-external-store/shim/with-selector', 'use-sync-external-store/shim/with-selector'],
		] as const) {
			const resolveRegistration = harness.onResolveRegistrations.find(({ options }) =>
				options.filter.test(specifier),
			);

			expect(resolveRegistration).toBeDefined();
			const result = await resolveRegistration?.callback({
				path: specifier,
				importer: '/app/entry.tsx',
				namespace: 'file',
			});

			expect(result).toEqual({
				path: expectedPath,
				namespace: 'ecopages-react-hmr-shim',
			});
		}
	});

	it('rewrites shim module variants to browser-safe ESM implementations', async () => {
		const harness = createPluginHarness();
		const shimLoadRegistration = harness.onLoadRegistrations.find(
			({ options }) => options.namespace === 'ecopages-react-hmr-shim',
		);

		expect(shimLoadRegistration).toBeDefined();
		const syntheticResult = await shimLoadRegistration?.callback({
			path: 'use-sync-external-store/shim',
			namespace: 'ecopages-react-hmr-shim',
		});

		expect(syntheticResult).toEqual({
			contents: "export { useSyncExternalStore } from 'react';",
			loader: 'js',
		});

		const withSelectorLoadRegistration = harness.onLoadRegistrations.find(
			({ options }) =>
				options.filter.test('use-sync-external-store/shim/with-selector') &&
				options.namespace === 'ecopages-react-hmr-shim',
		);

		expect(withSelectorLoadRegistration).toBeDefined();
		const withSelectorSyntheticResult = await withSelectorLoadRegistration?.callback({
			path: 'use-sync-external-store/shim/with-selector',
			namespace: 'ecopages-react-hmr-shim',
		});

		expect(withSelectorSyntheticResult).toEqual({
			contents: expect.stringContaining('export function useSyncExternalStoreWithSelector'),
			loader: 'js',
		});

		for (const variantPath of [
			'/workspace/node_modules/use-sync-external-store/shim/index.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.development.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js',
		]) {
			const variantRegistration = harness.onLoadRegistrations.find(({ options }) =>
				options.filter.test(variantPath),
			);
			expect(variantRegistration).toBeDefined();
			const variantResult = await variantRegistration?.callback({ path: variantPath, namespace: 'file' });
			expect(variantResult).toEqual({
				contents: "export { useSyncExternalStore } from 'react';",
				loader: 'js',
			});
		}

		for (const variantPath of [
			'/workspace/node_modules/use-sync-external-store/shim/with-selector.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js',
			'/workspace/node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js',
		]) {
			const variantRegistration = harness.onLoadRegistrations.find(({ options }) =>
				options.filter.test(variantPath),
			);
			expect(variantRegistration).toBeDefined();
			const variantResult = await variantRegistration?.callback({ path: variantPath, namespace: 'file' });
			expect(variantResult).toEqual({
				contents: expect.stringContaining('export function useSyncExternalStoreWithSelector'),
				loader: 'js',
			});
		}
	});
});
