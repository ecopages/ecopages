import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';

export function createUseSyncExternalStoreShimPlugin(options?: { name?: string; namespace?: string }): EcoBuildPlugin {
	const namespace = options?.namespace ?? 'ecopages-react-use-sync-external-store-shim';

	return {
		name: options?.name ?? 'react-use-sync-external-store-shim',
		setup(build) {
			build.onResolve({ filter: /^use-sync-external-store\/shim(?:\/index\.js)?$/ }, () => ({
				path: 'use-sync-external-store/shim',
				namespace,
			}));

			build.onLoad({ filter: /^use-sync-external-store\/shim$/, namespace }, () => ({
				contents: "export { useSyncExternalStore } from 'react';",
				loader: 'js',
			}));

			build.onLoad({ filter: /[\\/]use-sync-external-store[\\/]shim[\\/]index\.js$/ }, () => ({
				contents: "export { useSyncExternalStore } from 'react';",
				loader: 'js',
			}));

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.development\.js$/,
				},
				() => ({
					contents: "export { useSyncExternalStore } from 'react';",
					loader: 'js',
				}),
			);

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.production\.js$/,
				},
				() => ({
					contents: "export { useSyncExternalStore } from 'react';",
					loader: 'js',
				}),
			);
		},
	};
}
