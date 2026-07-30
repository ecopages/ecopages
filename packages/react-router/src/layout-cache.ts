/**
 * Persistent layout cache for SPA navigation and HMR.
 *
 * @remarks
 * When `persistLayouts` is enabled, the router reuses the first mounted layout
 * instance for each stable layout key across navigations. Layout identity is
 * resolved in this order:
 *
 * 1. `config.identity.file`
 * 2. `config.identity.id`
 * 3. Plain React fallback: `displayName`/`name` plus wrapper source signature
 *
 * Eco layouts are expected to carry injected component identity in client/HMR
 * bundles. The plain React fallback exists only for non-Eco layout components.
 *
 * @module layout-cache
 */

import { getComponentIdentity, type ComponentIdentity } from '@ecopages/core';
import type { ComponentType } from 'react';

export type LayoutComponent = ComponentType<Record<string, unknown>>;

export type LayoutComponentWithMeta = LayoutComponent & {
	config?: {
		identity?: ComponentIdentity;
	};
};

/**
 * Cache for layout components to ensure same reference across navigations.
 * When different pages import the same layout, they get different function
 * references. This cache ensures we reuse the first one seen for each layout key.
 *
 * Stored on window to persist across module reloads during HMR/SPA navigation.
 */
export function getLayoutCache(): Map<string, LayoutComponent> {
	if (typeof window === 'undefined') {
		return new Map();
	}
	const win = window as typeof window & { __ecoLayoutCache?: Map<string, LayoutComponent> };
	if (!win.__ecoLayoutCache) {
		win.__ecoLayoutCache = new Map();
	}
	return win.__ecoLayoutCache;
}

/**
 * Normalizes a layout cache key so logically identical layouts reuse the same
 * persistent instance across SPA navigations and HMR cycles.
 */
export function normalizeLayoutKey(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return 'layout';

	try {
		const asUrl = new URL(trimmed);
		return asUrl.pathname.replace(/\/$/, '') || 'layout';
	} catch {
		return trimmed.split('#')[0]?.split('?')[0]?.replace(/\/$/, '') || 'layout';
	}
}

function hashString(value: string): string {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
}

function getLayoutSourceSignature(Layout: LayoutComponent): string {
	const source = Function.prototype.toString.call(Layout).replace(/\s+/g, ' ').trim();
	return hashString(source);
}

/**
 * Resolves the cache key for a layout component.
 *
 * Prefers injected component identity when present. Falls back to the component
 * name and wrapper signature for plain React layouts without Eco metadata.
 */
export function getLayoutCacheKey(Layout: LayoutComponent): string {
	const layoutConfig = (Layout as LayoutComponentWithMeta).config;
	const identity = getComponentIdentity(layoutConfig);
	const layoutMetaKey = identity?.file || identity?.id;

	if (layoutMetaKey) {
		return normalizeLayoutKey(layoutMetaKey);
	}

	const layoutNameKey = Layout.displayName || Layout.name || 'layout';
	const sourceSignature = getLayoutSourceSignature(Layout);
	return `${normalizeLayoutKey(layoutNameKey)}:${sourceSignature}`;
}

/** Clears the layout cache. Called during HMR to ensure fresh layouts are used. */
export function clearLayoutCache(): void {
	getLayoutCache().clear();
}

/** Persisted layout instance and the React key derived from {@link getLayoutCacheKey}. */
export type ResolvedPersistedLayout = {
	layout: LayoutComponent;
	key: string;
};

/**
 * Stores or reuses a persisted layout instance for the resolved cache key.
 *
 * @param Layout - Layout component imported by the active page module.
 * @param refreshPersistedLayout - When `true`, replaces the cached instance if the
 * imported layout reference changed, such as during HMR or a top-level page refresh.
 * @returns The cached layout instance and its stable React key.
 */
export function resolvePersistedLayout(
	Layout: LayoutComponent,
	refreshPersistedLayout: boolean,
): ResolvedPersistedLayout {
	const layoutCache = getLayoutCache();
	const layoutKey = getLayoutCacheKey(Layout);
	const cached = layoutCache.get(layoutKey);

	if (!cached || (refreshPersistedLayout && cached !== Layout)) {
		layoutCache.set(layoutKey, Layout);
		return { layout: Layout, key: layoutKey };
	}

	return { layout: cached, key: layoutKey };
}

/**
 * Resolves one persisted layout instance per tier in an outer→inner stack.
 *
 * @remarks
 * Each tier is cached independently by {@link getLayoutCacheKey}. Routes that share
 * an outer layout (e.g. `[A, B]` and `[A, C]`) reuse the same cached `A` instance
 * while inner tiers mount and unmount with the active page.
 */
export function resolvePersistedLayoutStack(
	layouts: LayoutComponent[],
	refreshPersistedLayout: boolean,
): ResolvedPersistedLayout[] {
	return layouts.map((layout) => resolvePersistedLayout(layout, refreshPersistedLayout));
}
