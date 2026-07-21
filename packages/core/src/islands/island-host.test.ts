import { describe, expect, it } from 'vitest';
import {
	buildIslandHostAttributes,
	ECO_ISLAND_HOST_ATTRIBUTE,
	ECO_ISLAND_INTEGRATION_ATTRIBUTE,
	finalizeIslandComponentRender,
	isIslandHostElement,
} from './island-host.ts';

describe('island host attributes', () => {
	it('builds the island host marker contract', () => {
		const attributes = buildIslandHostAttributes({
			integrationName: 'react',
			componentInstanceId: 'host_n_1',
			componentKey: 'eco-component-1',
			props: { count: 1 },
		});

		expect(attributes[ECO_ISLAND_HOST_ATTRIBUTE]).toBe('');
		expect(attributes['data-eco-component-id']).toBe('host_n_1');
		expect(attributes[ECO_ISLAND_INTEGRATION_ATTRIBUTE]).toBe('react');
		expect(attributes['data-eco-component-key']).toBe('eco-component-1');
		expect(attributes['data-eco-props']).toBe(btoa(JSON.stringify({ count: 1 })));
	});

	it('finalizes component renders that ship client scripts', () => {
		const result = finalizeIslandComponentRender(
			{ integrationContext: { componentInstanceId: 'host_n_2' } },
			{
				canAttachAttributes: true,
				integrationName: 'lit',
				assets: [{ kind: 'script' }],
				rootAttributes: {} as Record<string, string>,
			},
		);

		expect(result.rootAttributes?.[ECO_ISLAND_HOST_ATTRIBUTE]).toBe('');
		expect(result.rootAttributes?.[ECO_ISLAND_INTEGRATION_ATTRIBUTE]).toBe('lit');
	});

	it('detects island hosts from marker attributes', () => {
		const element = {
			tagName: 'SECTION',
			hasAttribute(name: string) {
				return name === ECO_ISLAND_HOST_ATTRIBUTE;
			},
		} as unknown as Element;

		expect(isIslandHostElement(element)).toBe(true);
	});
});
