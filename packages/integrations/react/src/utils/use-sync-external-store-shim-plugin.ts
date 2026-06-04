import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';

const USE_SYNC_EXTERNAL_STORE_SHIM_EXPORT = "export { useSyncExternalStore } from 'react';";

const USE_SYNC_EXTERNAL_STORE_WITH_SELECTOR_EXPORT = `import { useDebugValue, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

const objectIs = Object.is;

export function useSyncExternalStoreWithSelector(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
	const instRef = useRef(null);
	let inst;

	if (instRef.current === null) {
		inst = { hasValue: false, value: null };
		instRef.current = inst;
	} else {
		inst = instRef.current;
	}

	const memoizedSelectionRef = useMemo(() => {
		let hasMemo = false;
		let memoizedSnapshot;
		let memoizedSelection;
		const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot;

		const memoizedSelector = nextSnapshot => {
			if (!hasMemo) {
				hasMemo = true;
				memoizedSnapshot = nextSnapshot;
				const nextSelection = selector(nextSnapshot);

				if (isEqual !== undefined && inst.hasValue) {
					const currentSelection = inst.value;
					if (isEqual(currentSelection, nextSelection)) {
						memoizedSelection = currentSelection;
						return currentSelection;
					}
				}

				memoizedSelection = nextSelection;
				return nextSelection;
			}

			const currentSelection = memoizedSelection;
			if (objectIs(memoizedSnapshot, nextSnapshot)) {
				return currentSelection;
			}

			const nextSelection = selector(nextSnapshot);
			if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
				memoizedSnapshot = nextSnapshot;
				return currentSelection;
			}

			memoizedSnapshot = nextSnapshot;
			memoizedSelection = nextSelection;
			return nextSelection;
		};

		return [
			() => memoizedSelector(getSnapshot()),
			maybeGetServerSnapshot === null ? undefined : () => memoizedSelector(maybeGetServerSnapshot()),
		];
	}, [getSnapshot, getServerSnapshot, selector, isEqual]);

	const value = useSyncExternalStore(subscribe, memoizedSelectionRef[0], memoizedSelectionRef[1]);

	useEffect(() => {
		inst.hasValue = true;
		inst.value = value;
	}, [value]);

	useDebugValue(value);
	return value;
}
`;

export function createUseSyncExternalStoreShimPlugin(options?: { name?: string; namespace?: string }): EcoBuildPlugin {
	const namespace = options?.namespace ?? 'ecopages-react-use-sync-external-store-shim';

	return {
		name: options?.name ?? 'react-use-sync-external-store-shim',
		setup(build) {
			build.onResolve({ filter: /^use-sync-external-store\/shim(?:\/index\.js)?$/ }, () => ({
				path: 'use-sync-external-store/shim',
				namespace,
			}));

			build.onResolve({ filter: /^use-sync-external-store\/shim\/with-selector(?:\.js)?$/ }, () => ({
				path: 'use-sync-external-store/shim/with-selector',
				namespace,
			}));

			build.onLoad({ filter: /^use-sync-external-store\/shim$/, namespace }, () => ({
				contents: USE_SYNC_EXTERNAL_STORE_SHIM_EXPORT,
				loader: 'js',
			}));

			build.onLoad({ filter: /^use-sync-external-store\/shim\/with-selector$/, namespace }, () => ({
				contents: USE_SYNC_EXTERNAL_STORE_WITH_SELECTOR_EXPORT,
				loader: 'js',
			}));

			build.onLoad({ filter: /[\\/]use-sync-external-store[\\/]shim[\\/]index\.js$/ }, () => ({
				contents: USE_SYNC_EXTERNAL_STORE_SHIM_EXPORT,
				loader: 'js',
			}));

			build.onLoad({ filter: /[\\/]use-sync-external-store[\\/]shim[\\/]with-selector\.js$/ }, () => ({
				contents: USE_SYNC_EXTERNAL_STORE_WITH_SELECTOR_EXPORT,
				loader: 'js',
			}));

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.development\.js$/,
				},
				() => ({
					contents: USE_SYNC_EXTERNAL_STORE_SHIM_EXPORT,
					loader: 'js',
				}),
			);

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim\.production\.js$/,
				},
				() => ({
					contents: USE_SYNC_EXTERNAL_STORE_SHIM_EXPORT,
					loader: 'js',
				}),
			);

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim[\\/]with-selector\.development\.js$/,
				},
				() => ({
					contents: USE_SYNC_EXTERNAL_STORE_WITH_SELECTOR_EXPORT,
					loader: 'js',
				}),
			);

			build.onLoad(
				{
					filter: /[\\/]use-sync-external-store[\\/]cjs[\\/]use-sync-external-store-shim[\\/]with-selector\.production\.js$/,
				},
				() => ({
					contents: USE_SYNC_EXTERNAL_STORE_WITH_SELECTOR_EXPORT,
					loader: 'js',
				}),
			);
		},
	};
}
