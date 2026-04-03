import type { ComponentMarker, MarkerNodeId } from './component-marker.ts';
import { parseComponentMarkers } from './component-marker.ts';

/**
 * Maps a parent slot reference to child marker node ids discovered in that slot.
 *
 * Keys are `slotRef` values emitted in marker payloads.
 */
export type SlotChildrenRegistry = Record<string, MarkerNodeId[]>;

/**
 * Serializable props captured for deferred marker nodes.
 *
 * The graph builder reads this registry to discover child markers that were not
 * emitted into the outer HTML stream because they were captured inside a
 * deferred parent's serialized `children` prop.
 */
export type PropsRegistry = Record<string, Record<string, unknown>>;

/**
 * Graph node enriched with source-order information for deterministic traversal.
 */
export type ComponentGraphNode = ComponentMarker & {
	order: number;
};

/**
 * Directed acyclic graph representation for component marker orchestration.
 *
 * `levels` are topological layers from roots to leaves.
 */
export type ComponentGraph = {
	nodes: Map<MarkerNodeId, ComponentGraphNode>;
	edges: Map<MarkerNodeId, Set<MarkerNodeId>>;
	reverseEdges: Map<MarkerNodeId, Set<MarkerNodeId>>;
	levels: MarkerNodeId[][];
};

/**
 * Reads nested marker tokens captured inside a deferred node's serialized
 * `children` prop.
 *
 * These child markers do not appear in the outer HTML buffer during the first
 * pass, so graph extraction must recover them from the props registry before it
 * can compute the full parent-child dependency chain.
 *
 * @param marker Marker whose serialized props may contain nested child markers.
 * @param propsRegistry Captured props keyed by marker props reference.
 * @returns Nested child markers discovered in serialized children.
 */
function readNestedChildMarkers(marker: ComponentMarker, propsRegistry: PropsRegistry): ComponentMarker[] {
	const children = propsRegistry[marker.propsRef]?.children;
	if (typeof children !== 'string' || !children.includes('<eco-marker')) {
		return [];
	}

	return parseComponentMarkers(children);
}

/**
 * Ensures adjacency maps are initialized and registers one directed edge.
 *
 * @param edges Parent -> children adjacency map.
 * @param reverseEdges Child -> parents adjacency map.
 * @param from Parent node id.
 * @param to Child node id.
 */
function ensureEdgeMaps(
	edges: Map<MarkerNodeId, Set<MarkerNodeId>>,
	reverseEdges: Map<MarkerNodeId, Set<MarkerNodeId>>,
	from: MarkerNodeId,
	to: MarkerNodeId,
): void {
	if (!edges.has(from)) {
		edges.set(from, new Set());
	}
	if (!reverseEdges.has(to)) {
		reverseEdges.set(to, new Set());
	}
	edges.get(from)?.add(to);
	reverseEdges.get(to)?.add(from);
}

/**
 * Builds topological levels from graph adjacency maps.
 *
 * Levels are ordered from roots to leaves and each level preserves source order.
 *
 * @param nodes Graph node registry.
 * @param edges Parent -> children adjacency map.
 * @param reverseEdges Child -> parents adjacency map.
 * @returns Topological levels from root level to leaf level.
 * @throws Error when a cycle or unresolved dependency remains.
 */
function computeLevels(
	nodes: Map<MarkerNodeId, ComponentGraphNode>,
	edges: Map<MarkerNodeId, Set<MarkerNodeId>>,
	reverseEdges: Map<MarkerNodeId, Set<MarkerNodeId>>,
): MarkerNodeId[][] {
	const indegree = new Map<MarkerNodeId, number>();
	for (const nodeId of nodes.keys()) {
		indegree.set(nodeId, reverseEdges.get(nodeId)?.size ?? 0);
	}

	const levels: MarkerNodeId[][] = [];
	let frontier = [...nodes.values()]
		.filter((node) => (indegree.get(node.nodeId) ?? 0) === 0)
		.sort((a, b) => a.order - b.order)
		.map((node) => node.nodeId);

	const visited = new Set<MarkerNodeId>();

	while (frontier.length > 0) {
		levels.push(frontier);
		const next: MarkerNodeId[] = [];

		for (const current of frontier) {
			visited.add(current);
			for (const child of edges.get(current) ?? []) {
				const nextInDegree = (indegree.get(child) ?? 0) - 1;
				indegree.set(child, nextInDegree);
				if (nextInDegree === 0) {
					next.push(child);
				}
			}
		}

		frontier = next
			.filter((nodeId, index) => next.indexOf(nodeId) === index)
			.sort((a, b) => {
				const orderA = nodes.get(a)?.order ?? 0;
				const orderB = nodes.get(b)?.order ?? 0;
				return orderA - orderB;
			});
	}

	if (visited.size !== nodes.size) {
		throw new Error('[ecopages] Component marker graph contains a cycle or unresolved dependency links.');
	}

	return levels;
}

/**
 * Extracts marker graph metadata from rendered HTML and slot linkage data.
 *
 * This is the canonical graph builder used by marker execution.
 *
 * Algorithm summary:
 * 1. Parse markers from HTML in source order.
 * 2. Discover nested child markers captured inside serialized `children` props.
 * 3. Create nodes and derive edges from `slotChildrenRegistry`.
 * 3. Compute deterministic topological levels.
 *
 * Unknown child node ids in `slotChildrenRegistry` are ignored to keep the
 * extractor tolerant to stale references.
 *
 * @param html Rendered HTML containing `eco-marker` tokens.
 * @param slotChildrenRegistry Optional slot -> child linkage map.
 * @param propsRegistry Optional props registry used to discover nested markers
 * captured inside deferred parent `children` props.
 * @returns Component graph structure with levels ready for execution.
 */
export function extractComponentGraph(
	html: string,
	slotChildrenRegistry: SlotChildrenRegistry = {},
	propsRegistry: PropsRegistry = {},
): ComponentGraph {
	const markers = parseComponentMarkers(html);
	const nodes = new Map<MarkerNodeId, ComponentGraphNode>();
	const edges = new Map<MarkerNodeId, Set<MarkerNodeId>>();
	const reverseEdges = new Map<MarkerNodeId, Set<MarkerNodeId>>();
	const discoveredMarkers: ComponentMarker[] = [];

	const registerMarker = (marker: ComponentMarker): boolean => {
		if (nodes.has(marker.nodeId)) {
			return false;
		}

		discoveredMarkers.push(marker);
		nodes.set(marker.nodeId, {
			...marker,
			order: discoveredMarkers.length - 1,
		});
		return true;
	};

	for (const marker of markers) {
		registerMarker(marker);
	}

	for (let index = 0; index < discoveredMarkers.length; index += 1) {
		const marker = discoveredMarkers[index];
		for (const nestedMarker of readNestedChildMarkers(marker, propsRegistry)) {
			registerMarker(nestedMarker);
		}
	}

	for (const marker of discoveredMarkers) {
		if (!marker.slotRef) {
			continue;
		}
		const linkedChildren = slotChildrenRegistry[marker.slotRef] ?? [];
		for (const childNodeId of linkedChildren) {
			if (!nodes.has(childNodeId)) {
				continue;
			}
			ensureEdgeMaps(edges, reverseEdges, marker.nodeId, childNodeId);
		}
	}

	const levels = computeLevels(nodes, edges, reverseEdges);
	return { nodes, edges, reverseEdges, levels };
}
