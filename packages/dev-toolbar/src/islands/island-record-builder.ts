export type IslandRecord = {
	id: string;
	label: string;
	componentKey?: string;
	componentId?: string;
	hostTag: string;
	kind: 'react-island' | 'integration' | 'custom-element';
	integration?: string;
	propsPreview: string;
	hydrated: boolean;
	element: HTMLElement;
};

export type IslandRecordView = Omit<IslandRecord, 'element'> & {
	targetSelector: string;
};

function parsePropsPreview(encoded: string | null): string {
	if (!encoded) {
		return '';
	}

	try {
		return JSON.stringify(JSON.parse(atob(encoded)), null, 0).slice(0, 120);
	} catch {
		return '(invalid props)';
	}
}

function isHydratedIsland(
	element: HTMLElement,
	componentKey: string | undefined,
	islandRoots: Record<string, unknown>,
): boolean {
	if (componentKey && islandRoots[componentKey]) {
		return true;
	}

	if (element.tagName.toLowerCase() === 'eco-island') {
		return element.childElementCount > 0;
	}

	return false;
}

function buildLabel(
	element: HTMLElement,
	componentKey: string | undefined,
	componentId: string | undefined,
	integration: string | undefined,
): string {
	if (componentId) {
		return componentId;
	}

	if (componentKey) {
		const segments = componentKey.split('/');
		return segments[segments.length - 1] || componentKey;
	}

	if (integration) {
		return `${integration} island`;
	}

	if (element.id) {
		return element.id;
	}

	return element.tagName.toLowerCase();
}

function getIslandKind(
	element: HTMLElement,
	componentKey: string | undefined,
	integration: string | undefined,
): IslandRecord['kind'] {
	if (integration === 'react' || componentKey || element.tagName.toLowerCase() === 'eco-island') {
		return 'react-island';
	}

	if (integration) {
		return 'integration';
	}

	return 'custom-element';
}

export function buildIslandTargetSelector(
	element: HTMLElement,
	record: Pick<IslandRecord, 'componentKey' | 'componentId'>,
): string {
	if (record.componentKey) {
		return `[data-eco-component-key="${CSS.escape(record.componentKey)}"]`;
	}

	if (record.componentId) {
		return `[data-eco-component-id="${CSS.escape(record.componentId)}"]`;
	}

	if (element.id) {
		return `#${CSS.escape(element.id)}`;
	}

	const segments: string[] = [];
	let current: Element | null = element;

	while (current && current !== current.ownerDocument.documentElement) {
		let segment = current.tagName.toLowerCase();
		const parent: Element | null = current.parentElement;

		if (parent) {
			const siblings = [...parent.children].filter((child) => child.tagName === current!.tagName);
			if (siblings.length > 1) {
				segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
			}
		}

		segments.unshift(segment);
		current = parent;
	}

	return segments.join(' > ');
}

export function toIslandRecordView(record: IslandRecord): IslandRecordView {
	const { element, ...view } = record;
	return {
		...view,
		targetSelector: buildIslandTargetSelector(element, record),
	};
}

/**
 * Builds one island record from a discovered host element.
 */
export function buildIslandRecord(element: HTMLElement, islandRoots: Record<string, unknown>): IslandRecord {
	const componentKey = element.getAttribute('data-eco-component-key') ?? undefined;
	const componentId = element.getAttribute('data-eco-component-id') ?? undefined;
	const integration = element.getAttribute('data-eco-island-integration') ?? undefined;
	const label = buildLabel(element, componentKey, componentId, integration);
	const id = componentId ?? componentKey ?? label;

	return {
		id,
		label,
		componentKey,
		componentId,
		integration,
		hostTag: element.tagName.toLowerCase(),
		kind: getIslandKind(element, componentKey, integration),
		propsPreview: parsePropsPreview(element.getAttribute('data-eco-props')),
		hydrated: isHydratedIsland(element, componentKey, islandRoots),
		element,
	};
}
