import { escapeHtmlAttribute } from '../../utils/html-escaping.ts';

/**
 * Stable marker node identifier used during one render graph resolution pass.
 *
 * @example
 * `n_12`
 */
export type MarkerNodeId = `n_${string}`;

/**
 * Marker payload used by graph extraction and execution.
 *
 * Each marker references:
 * - a component definition key (`componentRef`)
 * - a serialized props key (`propsRef`)
 */
export type ComponentMarker = {
	nodeId: MarkerNodeId;
	componentRef: string;
	propsRef: string;
};

/**
 * Input contract for marker emission.
 *
 * This shape is intentionally close to `ComponentMarker` to keep emission and
 * parsing symmetric.
 */
export type MarkerRenderInput = {
	nodeId: MarkerNodeId;
	componentRef: string;
	propsRef: string;
};

/**
 * Reads a single attribute value from a raw marker tag.
 *
 * @param tag Full marker tag text.
 * @param name Attribute name to read.
 * @returns Attribute value when present; otherwise `undefined`.
 */
function readAttribute(tag: string, name: string): string | undefined {
	const match = tag.match(new RegExp(`${name}="([^"]*)"`));
	return match?.[1];
}

/**
 * Creates the canonical `<eco-marker>` token used for deferred component rendering.
 *
 * @param input Marker payload fields.
 * @returns Serialized marker HTML token.
 */
export function createComponentMarker(input: MarkerRenderInput): string {
	const attributes = [
		`data-eco-node-id="${escapeHtmlAttribute(input.nodeId)}"`,
		`data-eco-component-ref="${escapeHtmlAttribute(input.componentRef)}"`,
		`data-eco-props-ref="${escapeHtmlAttribute(input.propsRef)}"`,
	];

	return `<eco-marker ${attributes.join(' ')}></eco-marker>`;
}

/**
 * Parses all valid `<eco-marker>` tokens from HTML output.
 *
 * Invalid markers (missing required attributes) are ignored by design.
 *
 * @param html Rendered HTML fragment or document.
 * @returns Parsed marker payloads in source order.
 */
export function parseComponentMarkers(html: string): ComponentMarker[] {
	const markerRegex = /<eco-marker\b[^>]*><\/eco-marker>/g;
	const results: ComponentMarker[] = [];

	for (let match = markerRegex.exec(html); match; match = markerRegex.exec(html)) {
		const tag = match[0];
		const nodeId = readAttribute(tag, 'data-eco-node-id');
		const componentRef = readAttribute(tag, 'data-eco-component-ref');
		const propsRef = readAttribute(tag, 'data-eco-props-ref');

		if (!nodeId || !componentRef || !propsRef) {
			continue;
		}

		results.push({
			nodeId: nodeId as MarkerNodeId,
			componentRef,
			propsRef,
		});
	}

	return results;
}
