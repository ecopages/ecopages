/**
 * Tracks which vendor files this page has loaded, so a vendor rebuild reloads only the pages that hold its output.
 * @module
 */

import { RESOLVED_ASSETS_VENDORS_DIR } from '../../constants.ts';

const VENDOR_URL_PREFIX = `/${RESOLVED_ASSETS_VENDORS_DIR}/`;

/**
 * Records the vendor files the page loads and answers whether it loaded any of a set of them.
 */
export interface LoadedVendorUrls {
	/** True when the page has loaded at least one of `urls`, given as the server sent them (paths). */
	hasLoadedAny(urls: readonly string[]): boolean;
}

/** The parts of `window` the tracker reads. */
export interface VendorTrackingWindow {
	location: { href: string };
	performance: { getEntriesByType(type: string): readonly NamedEntry[] };
	PerformanceObserver?: new (callback: (list: { getEntries(): readonly NamedEntry[] }) => void) => {
		observe(options: PerformanceObserverInit): void;
	};
}

type NamedEntry = { name: string };

/**
 * Starts recording the vendor files the page loads, those it already loaded included.
 *
 * @remarks
 * Uses a `PerformanceObserver` for resource entries, which keeps every entry it saw, unlike the resource timing
 * buffer, which stops at 250 and keeps only the first. The HMR client is the first script of the page, so the
 * observer sees every resource from the start, and the entries the buffer holds are replayed first. A file that is
 * still loading has no entry until it finishes, so a caller that asks after a change should let loads in flight
 * settle first. Without resource timing the page cannot tell what it loaded, so it counts every file as loaded and
 * reloads on any change.
 */
export function trackLoadedVendorUrls(win: VendorTrackingWindow): LoadedVendorUrls {
	const loaded = new Set<string>();
	const record = (entries: readonly NamedEntry[]) => {
		for (const entry of entries) {
			const { pathname } = new URL(entry.name, win.location.href);
			if (pathname.startsWith(VENDOR_URL_PREFIX)) loaded.add(pathname);
		}
	};

	if (typeof win.PerformanceObserver !== 'function') return { hasLoadedAny: () => true };
	try {
		const observer = new win.PerformanceObserver((list) => record(list.getEntries()));
		observer.observe({ type: 'resource', buffered: true });
	} catch {
		return { hasLoadedAny: () => true };
	}
	record(win.performance.getEntriesByType('resource'));

	return {
		hasLoadedAny: (urls) => {
			record(win.performance.getEntriesByType('resource'));
			return urls.some((url) => loaded.has(new URL(url, win.location.href).pathname));
		},
	};
}
