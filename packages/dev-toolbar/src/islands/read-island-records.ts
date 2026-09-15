import { discoverIslandElements, readIslandRoots } from './island-discovery.ts';
import { buildIslandRecord, type IslandRecord, type IslandRecordView } from './island-record-builder.ts';

export type { IslandRecord, IslandRecordView, IslandStatus } from './island-record-builder.ts';
export { toIslandRecordView } from './island-record-builder.ts';

/**
 * Resolves the live DOM node for an island record after hydration or route swaps.
 *
 * @remarks
 * Component IDs are instance identities and therefore resolve before shared
 * component keys. When an instance ID is present but gone, resolution stops
 * instead of falling through to a sibling that shares the component key.
 * Selector fallback is retained for legacy integrations without an instance ID.
 *
 * @param record - Toolbar record to resolve.
 * @param doc - Document containing the current host.
 * @returns The connected host element, or `null` when it is gone.
 */
export function resolveIslandElement(record: IslandRecordView, doc: Document = document): HTMLElement | null {
	if (record.componentId) {
		const escapedId = CSS.escape(record.componentId);
		const hostById = doc.querySelector(`[data-eco-component-id="${escapedId}"]`);
		if (hostById instanceof HTMLElement && hostById.isConnected) {
			return hostById;
		}
		return null;
	}

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
 * Discovers current hosts and builds records against the live root registry.
 *
 * @param doc - Document to inspect.
 * @returns Current toolbar records in document order.
 */
export function readIslandRecords(doc: Document = document): IslandRecord[] {
	const islandRoots = readIslandRoots();
	return discoverIslandElements(doc).map((element) => buildIslandRecord(element, islandRoots));
}
