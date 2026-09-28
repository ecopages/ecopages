type EcoPagesIslandRuntime = Window & {
	__ECO_PAGES__?: {
		islandRoots?: Record<string, unknown>;
	};
};

function isToolbarElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'eco-dev-toolbar';
}

function islandPriority(element: HTMLElement): number {
	if (!element.isConnected) {
		return -1;
	}

	const tag = element.tagName.toLowerCase();
	if (tag === 'eco-island') {
		return 100;
	}
	if (element.hasAttribute('data-eco-island')) {
		return 90;
	}
	if (element.hasAttribute('data-eco-component-key')) {
		return 80;
	}
	if (element.hasAttribute('data-eco-component-id')) {
		return 70;
	}

	return 10;
}

function addCandidate(candidates: Set<HTMLElement>, element: HTMLElement): void {
	if (!isToolbarElement(element)) {
		candidates.add(element);
	}
}

/**
 * Collects unique island host elements from the live document.
 *
 * @remarks
 * Discovery merges framework markers, custom-element hosts, and the React
 * registry because navigation can temporarily leave only one of those signals
 * in the document. Repeated instances sharing a component ID are deduplicated
 * in favor of dedicated island containers, while standalone hosts retain their
 * element identity. Results are ordered by document position for stable toolbar
 * presentation.
 *
 * @param doc - Document to inspect.
 * @returns Unique connected island host elements in document order.
 */
export function discoverIslandElements(doc: Document): HTMLElement[] {
	const candidates = new Set<HTMLElement>();

	for (const element of doc.querySelectorAll<HTMLElement>(
		'[data-eco-island], [data-eco-component-key], eco-island',
	)) {
		addCandidate(candidates, element);
	}

	const islandRoots = (window as EcoPagesIslandRuntime).__ECO_PAGES__?.islandRoots ?? {};
	for (const componentId of Object.keys(islandRoots)) {
		const escapedId = CSS.escape(componentId);
		for (const element of doc.querySelectorAll<HTMLElement>(`[data-eco-component-id="${escapedId}"]`)) {
			addCandidate(candidates, element);
		}
	}

	const dedupedByInstance = new Map<string, HTMLElement>();
	const standaloneElements = new Set<HTMLElement>();

	for (const element of candidates) {
		if (!element.isConnected) {
			continue;
		}

		const componentId = element.getAttribute('data-eco-component-id');
		if (componentId) {
			const existing = dedupedByInstance.get(componentId);
			if (!existing || islandPriority(element) > islandPriority(existing)) {
				dedupedByInstance.set(componentId, element);
			}
		} else {
			standaloneElements.add(element);
		}
	}

	const elements = [...dedupedByInstance.values(), ...standaloneElements];
	return elements.sort((left, right) => {
		if (left === right) {
			return 0;
		}

		const position = left.compareDocumentPosition(right);
		if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
			return -1;
		}
		if (position & Node.DOCUMENT_POSITION_PRECEDING) {
			return 1;
		}

		return 0;
	});
}

/**
 * Reads the live React island-root index used to enrich toolbar records.
 *
 * @returns Instance-keyed roots currently registered by the browser runtime.
 */
export function readIslandRoots(): Record<string, unknown> {
	return (window as EcoPagesIslandRuntime).__ECO_PAGES__?.islandRoots ?? {};
}
