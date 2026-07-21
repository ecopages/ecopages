export const ECO_ISLAND_HOST_ATTRIBUTE = 'data-eco-island';
export const ECO_ISLAND_INTEGRATION_ATTRIBUTE = 'data-eco-island-integration';
export const ECO_ISLAND_COMPONENT_ID_ATTRIBUTE = 'data-eco-component-id';
export const ECO_ISLAND_COMPONENT_KEY_ATTRIBUTE = 'data-eco-component-key';
export const ECO_ISLAND_PROPS_ATTRIBUTE = 'data-eco-props';

export type IslandHostAttributesInput = {
	integrationName: string;
	componentInstanceId: string;
	componentKey?: string;
	props?: Record<string, unknown>;
	existing?: Record<string, string>;
};

/**
 * @remarks Presence marker for hydratable component hosts, similar in spirit to Astro's `astro-island`.
 */
export function mergeIslandHostAttributes(input: {
	integrationName: string;
	componentInstanceId: string;
	existing?: Record<string, string>;
}): Record<string, string> {
	return {
		...input.existing,
		[ECO_ISLAND_HOST_ATTRIBUTE]: '',
		[ECO_ISLAND_COMPONENT_ID_ATTRIBUTE]:
			input.existing?.[ECO_ISLAND_COMPONENT_ID_ATTRIBUTE] ?? input.componentInstanceId,
		[ECO_ISLAND_INTEGRATION_ATTRIBUTE]: input.integrationName,
	};
}

export function buildIslandHostAttributes(input: IslandHostAttributesInput): Record<string, string> {
	const attributes = mergeIslandHostAttributes(input);

	if (input.componentKey) {
		attributes[ECO_ISLAND_COMPONENT_KEY_ATTRIBUTE] = input.componentKey;
	}

	if (input.props !== undefined) {
		attributes[ECO_ISLAND_PROPS_ATTRIBUTE] = btoa(JSON.stringify(input.props));
	}

	return attributes;
}

export function isIslandHostElement(element: Element): boolean {
	if (element.hasAttribute(ECO_ISLAND_HOST_ATTRIBUTE)) {
		return true;
	}

	if (element.hasAttribute(ECO_ISLAND_COMPONENT_KEY_ATTRIBUTE)) {
		return true;
	}

	if (element.tagName.toLowerCase() === 'eco-island') {
		return true;
	}

	return element.hasAttribute(ECO_ISLAND_COMPONENT_ID_ATTRIBUTE) && element.hasAttribute(ECO_ISLAND_PROPS_ATTRIBUTE);
}

export function componentRenderHasIslandBootstrap(assets: Array<{ kind: string }> | undefined): boolean {
	return (assets ?? []).some((asset) => asset.kind === 'script');
}

export function finalizeIslandComponentRender<
	T extends {
		canAttachAttributes: boolean;
		integrationName: string;
		rootAttributes?: Record<string, string>;
		assets?: Array<{ kind: string }>;
	},
>(input: { integrationContext?: { componentInstanceId?: string } }, result: T): T {
	const componentInstanceId = input.integrationContext?.componentInstanceId;
	if (!componentInstanceId || !result.canAttachAttributes || !componentRenderHasIslandBootstrap(result.assets)) {
		return result;
	}

	return {
		...result,
		rootAttributes: mergeIslandHostAttributes({
			integrationName: result.integrationName,
			componentInstanceId,
			existing: result.rootAttributes,
		}),
	};
}
