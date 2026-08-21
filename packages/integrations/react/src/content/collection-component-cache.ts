import type { EcoComponent } from '@ecopages/core';

type ComponentRecord =
	| { status: 'pending'; promise: Promise<void> }
	| { status: 'success'; component: EcoComponent<Record<string, unknown>> }
	| { status: 'error'; error: unknown };

export type CollectionComponentCache = {
	preload(slug: string): Promise<void>;
	prime(slug: string, component: Promise<EcoComponent<Record<string, unknown>>>): Promise<void>;
	get(slug: string): EcoComponent<Record<string, unknown>>;
};

/**
 * Creates the synchronous component lookup required by a Page that preloads
 * collection MDX before SSR, hydration, and client navigation.
 *
 * @remarks
 * `preload()` loads the browser-compiled component and must not run in
 * `staticProps`. A hydratable collection Page primes the cache in `staticProps`
 * with its server component, then exposes a named `preload` export for
 * hydration and client navigation to load the browser component.
 *
 * Completed loads are deliberately refreshed by the next preload. Native
 * module caching keeps that inexpensive while allowing HMR to replace a
 * component before the Page re-renders.
 *
 * `prime()` always stores the provided server component, even when a
 * `preload()` is already in flight. Completions from a superseded load are
 * ignored so they cannot replace the primed entry.
 */
export function createCollectionComponentCache(
	loadComponent: (slug: string) => Promise<EcoComponent<Record<string, unknown>>>,
): CollectionComponentCache {
	const records = new Map<string, ComponentRecord>();
	const store = async (slug: string, component: Promise<EcoComponent<Record<string, unknown>>>): Promise<void> => {
		const pending: { record?: ComponentRecord } = {};
		const promise = component.then(
			(resolvedComponent) => {
				if (records.get(slug) === pending.record) {
					records.set(slug, { status: 'success', component: resolvedComponent });
				}
			},
			(error: unknown) => {
				if (records.get(slug) === pending.record) {
					records.set(slug, { status: 'error', error });
				}
				throw error;
			},
		);
		pending.record = { status: 'pending', promise };
		records.set(slug, pending.record);
		return await promise;
	};

	return {
		async preload(slug) {
			const existing = records.get(slug);
			if (existing?.status === 'pending') {
				return await existing.promise;
			}
			return await store(slug, loadComponent(slug));
		},

		async prime(slug, component) {
			return await store(slug, component);
		},

		get(slug) {
			const record = records.get(slug);
			if (!record) {
				throw new Error(`[ecopages] Collection content '${slug}' was rendered before it was preloaded.`);
			}
			if (record.status === 'success') {
				return record.component;
			}
			if (record.status === 'error') {
				throw record.error;
			}
			throw new Error(`[ecopages] Collection content '${slug}' is still loading during render.`);
		},
	};
}
