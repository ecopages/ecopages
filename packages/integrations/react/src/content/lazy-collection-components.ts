import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { EcoComponent } from '@ecopages/core';

type CollectionComponent = EcoComponent<Record<string, unknown>>;

export type LazyCollectionComponents = {
	get(slug: string): LazyExoticComponent<ComponentType<Record<string, unknown>>>;
};

/**
 * Creates the lookup that gives a Page one `React.lazy` component per collection entry.
 *
 * @remarks
 * Call it once at module level so every render of a slug receives the same
 * component type; React keeps the loaded entry and does not remount it.
 * Server rendering waits for the entry before sending HTML, and hydration keeps
 * that HTML until the browser entry has loaded.
 *
 * The component suspends, so a Suspense boundary above it decides what shows
 * meanwhile. Keep the boundary at a stable position in the Page: when a client
 * navigation switches entries inside it, React holds the current content until
 * the next entry is ready instead of showing a fallback.
 *
 * Because the lookup is created by the Page module, a Page module reloaded by
 * HMR gets a fresh lookup and therefore loads the edited entry. A failed load
 * throws to the nearest error boundary and is dropped from the lookup, so the
 * next render after that boundary resets retries instead of replaying the
 * rejection. Without an error boundary React unmounts the whole page.
 */
export function createLazyCollectionComponents(
	loadComponent: (slug: string) => Promise<CollectionComponent>,
): LazyCollectionComponents {
	const components = new Map<string, ReturnType<LazyCollectionComponents['get']>>();

	return {
		get(slug) {
			let component = components.get(slug);
			if (!component) {
				component = lazy(async () => {
					try {
						return { default: await loadComponent(slug) };
					} catch (error) {
						components.delete(slug);
						throw error;
					}
				});
				components.set(slug, component);
			}
			return component;
		},
	};
}
