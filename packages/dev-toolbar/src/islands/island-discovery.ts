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

function getDedupeKey(element: HTMLElement, doc: Document): string {
	const componentKey = element.getAttribute('data-eco-component-key');
	if (componentKey) {
		return `key:${componentKey}`;
	}

	const componentId = element.getAttribute('data-eco-component-id');
	if (componentId) {
		return `id:${componentId}`;
	}

	if (element.id) {
		return `dom-id:${element.id}`;
	}

	const tag = element.tagName.toLowerCase();
	if (tag.includes('-')) {
		const index = [...(element.parentElement?.children ?? [])].indexOf(element);
		return `custom:${tag}:${index}`;
	}

	const index = [...doc.querySelectorAll<HTMLElement>(tag)].indexOf(element);
	return `tag:${tag}:${index}`;
}

function addCandidate(candidates: Set<HTMLElement>, element: HTMLElement): void {
	if (!isToolbarElement(element)) {
		candidates.add(element);
	}
}

/**
 * Collects unique island host elements from the live document.
 */
export function discoverIslandElements(doc: Document): HTMLElement[] {
	const candidates = new Set<HTMLElement>();

	for (const element of doc.querySelectorAll<HTMLElement>('[data-eco-island]')) {
		addCandidate(candidates, element);
	}

	for (const element of doc.querySelectorAll<HTMLElement>('[data-eco-component-key]')) {
		addCandidate(candidates, element);
	}

	for (const element of doc.querySelectorAll<HTMLElement>('eco-island')) {
		addCandidate(candidates, element);
	}

	const islandRoots = (window as EcoPagesIslandRuntime).__ECO_PAGES__?.islandRoots ?? {};
	for (const componentKey of Object.keys(islandRoots)) {
		const escapedKey = CSS.escape(componentKey);
		for (const element of doc.querySelectorAll<HTMLElement>(`[data-eco-component-key="${escapedKey}"]`)) {
			addCandidate(candidates, element);
		}
		for (const element of doc.querySelectorAll<HTMLElement>(`eco-island[data-eco-component-key="${escapedKey}"]`)) {
			addCandidate(candidates, element);
		}
	}

	const deduped = new Map<string, HTMLElement>();
	for (const element of candidates) {
		if (!element.isConnected) {
			continue;
		}

		const key = getDedupeKey(element, doc);
		const existing = deduped.get(key);
		if (!existing || islandPriority(element) > islandPriority(existing)) {
			deduped.set(key, element);
		}
	}

	return [...deduped.values()].sort((left, right) => {
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

export function readIslandRoots(): Record<string, unknown> {
	return (window as EcoPagesIslandRuntime).__ECO_PAGES__?.islandRoots ?? {};
}
