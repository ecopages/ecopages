import { createElement, lazy, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react';
import type { EcoComponent } from '@ecopages/core';

type CollectionComponent = EcoComponent<Record<string, unknown>>;

/** Structural copy of the content-processor `ContentCollectionLoader`, which this package does not depend on. */
type CollectionLoader = {
	(slug: string): Promise<CollectionComponent>;
	readonly collection: string;
};

export type LazyCollectionComponents = {
	get(slug: string): LazyExoticComponent<ComponentType<Record<string, unknown>>>;
};

type CollectionLookup = LazyCollectionComponents & {
	loader: CollectionLoader;
	refresh(): void;
};

type LoadedEntry = {
	Host: ComponentType<Record<string, unknown>>;
	set(component: CollectionComponent): void;
};

const lookups = new Map<string, CollectionLookup>();

/**
 * @remarks
 * The lazy type resolves to `Host` once, so React keeps it mounted. A newer component for the
 * entry re-renders `Host` instead of suspending again, so the Suspense fallback is not shown.
 */
function createLoadedEntry(initial: CollectionComponent): LoadedEntry {
	let current = initial;
	const listeners = new Set<() => void>();
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const getSnapshot = () => current;

	function LoadedCollectionEntry(props: Record<string, unknown>) {
		return createElement(useSyncExternalStore(subscribe, getSnapshot, getSnapshot), props);
	}

	return {
		Host: LoadedCollectionEntry,
		set(component) {
			if (component === current) return;
			current = component;
			for (const listener of listeners) listener();
		},
	};
}

function createLookup(loader: CollectionLoader): CollectionLookup {
	const components = new Map<string, ReturnType<LazyCollectionComponents['get']>>();
	const loaded = new Map<string, LoadedEntry>();

	const lookup: CollectionLookup = {
		loader,
		get(slug) {
			let component = components.get(slug);
			if (!component) {
				component = lazy(async () => {
					try {
						const entry = createLoadedEntry(await lookup.loader(slug));
						loaded.set(slug, entry);
						return { default: entry.Host };
					} catch (error) {
						components.delete(slug);
						throw error;
					}
				});
				components.set(slug, component);
			}
			return component;
		},
		refresh() {
			const current = lookup.loader;
			for (const [slug, entry] of loaded) {
				current(slug).then(
					(component) => {
						if (lookup.loader === current) entry.set(component);
					},
					() => {},
				);
			}
		},
	};
	return lookup;
}

/**
 * Creates the lookup that gives a Page one `React.lazy` component per collection entry.
 *
 * @remarks
 * Call it once at module level so every render of a slug receives the same
 * component type; React keeps the loaded entry and does not remount it.
 * Server rendering waits for the entry before sending HTML, and hydration keeps
 * that HTML until the browser entry has loaded.
 *
 * There is one lookup per collection, kept in this module, which Page HMR does not replace.
 * In the browser, a later call for the same collection with a new loader (a Page module
 * evaluated again by HMR or another Page sharing the collection) returns that lookup: loaded
 * entries keep their lazy type and stay on screen without the Suspense fallback, and later
 * loads use the new loader. Each loaded entry is loaded again through the new loader and
 * re-renders in place when its module changed, which is how an edited MDX file shows up;
 * a failed reload keeps the entry on screen.
 * On the server a new loader means the server module graph was reloaded, so the call
 * starts a new lookup instead of serving entries from the old graph. A failed load is
 * dropped from the lookup, so a later render retries instead of replaying the rejection.
 *
 * The component suspends, so a Suspense boundary above it decides what shows
 * meanwhile. Keep the boundary at a stable position in the Page: when a client
 * navigation switches entries inside it, React holds the current content until
 * the next entry is ready instead of showing a fallback.
 */
export function createLazyCollectionComponents(loadComponent: CollectionLoader): LazyCollectionComponents {
	const existing = lookups.get(loadComponent.collection);
	if (existing?.loader === loadComponent) return existing;
	if (existing && typeof window !== 'undefined') {
		existing.loader = loadComponent;
		existing.refresh();
		return existing;
	}
	const created = createLookup(loadComponent);
	lookups.set(loadComponent.collection, created);
	return created;
}
