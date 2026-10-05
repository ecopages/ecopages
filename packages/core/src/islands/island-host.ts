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
function mergeIslandHostAttributes(input: {
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

/**
 * Encodes island props for `data-eco-props` as base64 of their UTF-8 JSON.
 *
 * @remarks
 * `btoa` accepts Latin-1 only, so the JSON is encoded to UTF-8 bytes first. Text such as `€`, CJK or emoji
 * would otherwise throw during SSR.
 */
export function encodeIslandProps(props: Record<string, unknown>): string {
	let binary = '';
	for (const byte of new TextEncoder().encode(JSON.stringify(props))) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function buildIslandHostAttributes(input: IslandHostAttributesInput): Record<string, string> {
	const attributes = mergeIslandHostAttributes(input);

	if (input.componentKey) {
		attributes[ECO_ISLAND_COMPONENT_KEY_ATTRIBUTE] = input.componentKey;
	}

	if (input.props !== undefined) {
		attributes[ECO_ISLAND_PROPS_ATTRIBUTE] = encodeIslandProps(input.props);
	}

	return attributes;
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
