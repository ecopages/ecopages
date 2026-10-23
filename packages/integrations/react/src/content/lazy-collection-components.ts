import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { getComponentIdentity, type EcoComponent } from '@ecopages/core';

type CollectionComponent = EcoComponent<Record<string, unknown>>;
type CollectionLoader = (slug: string) => Promise<CollectionComponent>;

export type LazyCollectionComponents = {
	get(slug: string): LazyExoticComponent<ComponentType<Record<string, unknown>>>;
};

type PageHmrRuntime = {
	hmrHandlers?: Record<string, (url: string) => Promise<void>>;
};

type PageWindow = Window & { __ECO_PAGES__?: PageHmrRuntime };

const lookups = new WeakMap<CollectionLoader, LazyCollectionComponents>();
const dropsByImportPath = new Map<string, Set<() => void>>();
const installedHandlers = new Map<string, (url: string) => Promise<void>>();

const DEV_TRANSFORM_URL_PREFIX = '/assets/__eco_dev__';

/**
 * @remarks
 * The HMR client keys handlers by the transformed URL. Identity files are
 * source paths; this takes the substring after the last `/src/` and swaps the
 * extension for `.js`. App folders that are not named `src` do not match.
 */
function sourceFileToDevTransformUrl(file: string): string | undefined {
	const normalized = file.replaceAll('\\', '/');
	const marker = '/src/';
	const index = normalized.lastIndexOf(marker);
	if (index === -1) return;
	const relative = normalized.slice(index + marker.length).replace(/\.(tsx?|jsx?|mdx?)$/u, '.js');
	return `${DEV_TRANSFORM_URL_PREFIX}/${relative}`;
}

/**
 * Drops the slug when that entry's source module hot-updates so the next `get` loads the new entry.
 *
 * @remarks
 * The Page module is replaced on HMR, but this helper module is not, so the lookup can outlive it.
 * One handler is registered per transform URL. A registered handler is the exclusive owner of that
 * update, so when no previous handler exists the default re-import still runs here.
 */
function watchEntrySource(file: string | undefined, drop: () => void): void {
	if (typeof window === 'undefined' || file === undefined) return;
	const importPath = sourceFileToDevTransformUrl(file);
	if (!importPath) return;
	const runtime = ((window as PageWindow).__ECO_PAGES__ ??= {});
	runtime.hmrHandlers ??= {};
	const drops = dropsByImportPath.get(importPath) ?? new Set<() => void>();
	dropsByImportPath.set(importPath, drops);
	drops.add(drop);
	const installed = installedHandlers.get(importPath);
	if (installed !== undefined && runtime.hmrHandlers[importPath] === installed) return;

	const previous = runtime.hmrHandlers[importPath];
	const handler = async (url: string) => {
		const pending = [...drops];
		drops.clear();
		for (const pendingDrop of pending) pendingDrop();
		if (previous) await previous(url);
		else await import(url);
	};
	installedHandlers.set(importPath, handler);
	runtime.hmrHandlers[importPath] = handler;
}

function createLookup(loadComponent: CollectionLoader): LazyCollectionComponents {
	const components = new Map<string, ReturnType<LazyCollectionComponents['get']>>();

	return {
		get(slug) {
			let component = components.get(slug);
			if (!component) {
				component = lazy(async () => {
					try {
						const loaded = await loadComponent(slug);
						watchEntrySource(getComponentIdentity(loaded)?.file, () => {
							components.delete(slug);
						});
						return { default: loaded };
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

/**
 * Creates the lookup that gives a Page one `React.lazy` component per collection entry.
 *
 * @remarks
 * Call it once at module level so every render of a slug receives the same
 * component type; React keeps the loaded entry and does not remount it.
 * Server rendering waits for the entry before sending HTML, and hydration keeps
 * that HTML until the browser entry has loaded.
 *
 * The helper module is not replaced when a Page file hot-updates, and repeated
 * calls with the same loader function reuse the same lookup, so a remounted Page
 * keeps the resolved lazy type. Reuse depends on that function identity, which
 * holds while the collection `/component` module is not replaced. An edited MDX
 * file drops that slug so the next `get` loads the new entry. A failed load is
 * dropped from the lookup, so a later render retries instead of replaying the
 * rejection.
 *
 * The component suspends, so a Suspense boundary above it decides what shows
 * meanwhile. Keep the boundary at a stable position in the Page: when a client
 * navigation switches entries inside it, React holds the current content until
 * the next entry is ready instead of showing a fallback.
 */
export function createLazyCollectionComponents(loadComponent: CollectionLoader): LazyCollectionComponents {
	const existing = lookups.get(loadComponent);
	if (existing) return existing;
	const created = createLookup(loadComponent);
	lookups.set(loadComponent, created);
	return created;
}
