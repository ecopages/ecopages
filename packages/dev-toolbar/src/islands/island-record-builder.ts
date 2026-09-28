export type IslandStatus = 'hydrated' | 'registered' | 'ssr-only';

export type IslandRecord = {
	id: string;
	label: string;
	componentKey?: string;
	componentId?: string;
	hostTag: string;
	kind: 'react-island' | 'integration' | 'custom-element';
	status: IslandStatus;
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

/**
 * Resolves the integration-specific lifecycle status for one host element.
 *
 * @remarks
 * Explicit hydration markers (`data-eco-hydrated`) indicate completed hydration
 * across all integrations. React hosts require this post-commit marker. Lit
 * elements require custom-element registration, clearance of `defer-hydration`,
 * and verified initial update completion via `hasUpdated`. Custom elements
 * registered in the browser but lacking an update completion signal are reported
 * as 'registered' rather than 'hydrated'. Unregistered hosts are 'ssr-only'.
 */
function resolveIslandStatus(
	element: HTMLElement,
	componentId: string | undefined,
	islandRoots: Record<string, unknown>,
): IslandStatus {
	if (element.hasAttribute('data-eco-hydrated')) {
		return 'hydrated';
	}

	const integration = element.getAttribute('data-eco-island-integration');
	if (integration === 'react' || (!integration && element.tagName.toLowerCase() === 'eco-island')) {
		return 'ssr-only';
	}

	const tag = element.tagName.toLowerCase();
	const isCustomElement = tag.includes('-');

	if (isCustomElement && typeof customElements !== 'undefined') {
		const isDefined = Boolean(customElements.get(tag));
		if (isDefined) {
			const isDeferred = element.hasAttribute('defer-hydration');
			const hasUpdated = (element as { hasUpdated?: unknown }).hasUpdated === true;

			if (!isDeferred && hasUpdated) {
				return 'hydrated';
			}

			return 'registered';
		}
	}

	if (componentId && islandRoots[componentId]) {
		return 'hydrated';
	}

	return 'ssr-only';
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
	if (integration === 'react' || (!integration && (element.tagName.toLowerCase() === 'eco-island' || componentKey))) {
		return 'react-island';
	}

	if (integration) {
		return 'integration';
	}

	return 'custom-element';
}

/**
 * Builds the selector used to resolve a record after navigation or rerender.
 *
 * @remarks
 * Instance IDs take precedence over component keys so repeated instances never
 * resolve to a sibling that happens to use the same component entry.
 *
 * @param element - Current host element.
 * @param record - Identity fields from the discovered record.
 * @returns A selector that targets the same host instance when possible.
 */
export function buildIslandTargetSelector(
	element: HTMLElement,
	record: Pick<IslandRecord, 'componentKey' | 'componentId'>,
): string {
	if (record.componentId) {
		return `[data-eco-component-id="${CSS.escape(record.componentId)}"]`;
	}

	if (record.componentKey) {
		return `[data-eco-component-key="${CSS.escape(record.componentKey)}"]`;
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

/**
 * Converts an internal record into the serializable toolbar-facing view.
 *
 * @param record - Record containing the live element reference.
 * @returns Record view with a selector instead of the DOM node.
 */
export function toIslandRecordView(record: IslandRecord): IslandRecordView {
	const { element, ...view } = record;
	return {
		...view,
		targetSelector: buildIslandTargetSelector(element, record),
	};
}

/**
 * Builds one island record from a discovered host element.
 * The explicit React hydration marker is preserved as the toolbar's completion
 * signal while SSR-only hosts remain visibly unhydrated.
 *
 * @param element - Discovered island host.
 * @param islandRoots - Instance-keyed runtime registry.
 * @returns Toolbar record containing identity, status, and live element.
 */
export function buildIslandRecord(element: HTMLElement, islandRoots: Record<string, unknown>): IslandRecord {
	const componentKey = element.getAttribute('data-eco-component-key') ?? undefined;
	const componentId = element.getAttribute('data-eco-component-id') ?? undefined;
	const integration = element.getAttribute('data-eco-island-integration') ?? undefined;
	const label = buildLabel(element, componentKey, componentId, integration);
	const id = componentId ?? componentKey ?? label;
	const status = resolveIslandStatus(element, componentId, islandRoots);

	return {
		id,
		label,
		componentKey,
		componentId,
		integration,
		hostTag: element.tagName.toLowerCase(),
		kind: getIslandKind(element, componentKey, integration),
		propsPreview: parsePropsPreview(element.getAttribute('data-eco-props')),
		status,
		hydrated: status === 'hydrated',
		element,
	};
}
