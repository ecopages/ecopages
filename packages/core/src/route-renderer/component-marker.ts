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
 * - the owning integration renderer (`integration`)
 * - a component definition key (`componentRef`)
 * - a serialized props key (`propsRef`)
 * - optional child-slot linkage (`slotRef`)
 */
export type ComponentMarker = {
	nodeId: MarkerNodeId;
	integration: string;
	componentRef: string;
	propsRef: string;
	slotRef?: string;
};

/**
 * Input contract for marker emission.
 *
 * This shape is intentionally close to `ComponentMarker` to keep emission and
 * parsing symmetric.
 */
export type MarkerRenderInput = {
	nodeId: MarkerNodeId;
	integration: string;
	componentRef: string;
	propsRef: string;
	slotRef?: string;
};

/**
 * Escapes marker attribute values for safe HTML output.
 *
 * @param value Raw attribute value.
 * @returns HTML-escaped attribute value.
 */
function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
		`data-eco-node-id="${escapeAttribute(input.nodeId)}"`,
		`data-eco-integration="${escapeAttribute(input.integration)}"`,
		`data-eco-component-ref="${escapeAttribute(input.componentRef)}"`,
		`data-eco-props-ref="${escapeAttribute(input.propsRef)}"`,
	];

	if (input.slotRef) {
		attributes.push(`data-eco-slot-ref="${escapeAttribute(input.slotRef)}"`);
	}

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
		const integration = readAttribute(tag, 'data-eco-integration');
		const componentRef = readAttribute(tag, 'data-eco-component-ref');
		const propsRef = readAttribute(tag, 'data-eco-props-ref');
		const slotRef = readAttribute(tag, 'data-eco-slot-ref');

		if (!nodeId || !integration || !componentRef || !propsRef) {
			continue;
		}

		results.push({
			nodeId: nodeId as MarkerNodeId,
			integration,
			componentRef,
			propsRef,
			slotRef,
		});
	}

	return results;
}
