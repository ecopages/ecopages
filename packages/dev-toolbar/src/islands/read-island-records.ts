import { discoverIslandElements, readIslandRoots } from './island-discovery.ts';
import { buildIslandRecord, type IslandRecord, type IslandRecordView } from './island-record-builder.ts';

export type { IslandRecord, IslandRecordView } from './island-record-builder.ts';
export { toIslandRecordView } from './island-record-builder.ts';

/**
 * Resolves the live DOM node for an island record after hydration or route swaps.
 */
export function resolveIslandElement(record: IslandRecordView, doc: Document = document): HTMLElement | null {
	if (record.componentKey) {
		const escapedKey = CSS.escape(record.componentKey);
		const hydratedIsland = doc.querySelector(`eco-island[data-eco-component-key="${escapedKey}"]`);
		if (hydratedIsland instanceof HTMLElement && hydratedIsland.isConnected) {
			return hydratedIsland;
		}

		const keyedHost = doc.querySelector(`[data-eco-component-key="${escapedKey}"]`);
		if (keyedHost instanceof HTMLElement && keyedHost.isConnected) {
			return keyedHost;
		}
	}

	if (record.componentId) {
		const escapedId = CSS.escape(record.componentId);
		const hostById = doc.querySelector(`[data-eco-component-id="${escapedId}"]`);
		if (hostById instanceof HTMLElement && hostById.isConnected) {
			return hostById;
		}
	}

	try {
		const fallback = doc.querySelector(record.targetSelector);
		if (fallback instanceof HTMLElement && fallback.isConnected) {
			return fallback;
		}
	} catch {
		return null;
	}

	return null;
}

/**
 * Collects island hosts stamped by core (`data-eco-island`) plus legacy React hydration roots.
 */
export function readIslandRecords(doc: Document = document): IslandRecord[] {
	const islandRoots = readIslandRoots();
	return discoverIslandElements(doc).map((element) => buildIslandRecord(element, islandRoots));
}
