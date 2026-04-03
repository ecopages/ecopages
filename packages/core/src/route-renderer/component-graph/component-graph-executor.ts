import type { ComponentMarker, MarkerNodeId } from './component-marker.ts';
import type { ComponentGraph } from './component-graph.ts';

/**
 * Render result returned by a graph node resolver.
 *
 * `html` is inserted in place of the corresponding marker token.
 */
export type GraphNodeRenderResult = {
	html: string;
};

/**
 * Callback used to render one marker node during graph execution.
 *
 * Resolver implementations may call integration-specific `renderComponent`
 * and can use closure state to wire child output into parent render calls.
 */
export type GraphNodeResolver = (marker: ComponentMarker) => Promise<GraphNodeRenderResult>;

/**
 * Escapes dynamic content before embedding it in a regular expression.
 *
 * @param value Raw regex input.
 * @returns Escaped regex-safe value.
 */
function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces exactly one marker token matching the provided node id.
 *
 * @param html Current HTML buffer.
 * @param nodeId Marker node id to replace.
 * @param replacement Rendered HTML replacement.
 * @returns Updated HTML buffer.
 */
function replaceMarkerByNodeId(html: string, nodeId: MarkerNodeId, replacement: string): string {
	const pattern = `<eco-marker[^>]*data-eco-node-id="${escapeRegex(nodeId)}"[^>]*><\\/eco-marker>`;
	const markerRegex = new RegExp(pattern);
	return html.replace(markerRegex, replacement);
}

/**
 * Resolves all markers in bottom-up order based on computed graph levels.
 *
 * Child nodes are resolved first so parent slot content can consume already
 * resolved child HTML in subsequent resolver invocations.
 *
 * Nodes discovered from serialized props may not exist as literal marker tokens in
 * `inputHtml`. They still resolve so parent nodes can consume their stitched child
 * HTML, while replacement in the outer HTML buffer remains a no-op.
 *
 * @param inputHtml HTML containing marker tokens.
 * @param graph Precomputed marker graph with topological levels.
 * @param resolver Async callback that renders each marker node.
 * @returns HTML with resolved markers replaced.
 */
export async function resolveComponentGraph(
	inputHtml: string,
	graph: ComponentGraph,
	resolver: GraphNodeResolver,
): Promise<string> {
	let html = inputHtml;
	const markersById = new Map<MarkerNodeId, ComponentMarker>();
	for (const node of graph.nodes.values()) {
		markersById.set(node.nodeId, node);
	}

	const levels = [...graph.levels].reverse();
	for (const level of levels) {
		for (const nodeId of level) {
			const marker = markersById.get(nodeId);
			if (!marker) {
				continue;
			}
			const result = await resolver(marker);
			html = replaceMarkerByNodeId(html, nodeId, result.html);
		}
	}

	return html;
}
