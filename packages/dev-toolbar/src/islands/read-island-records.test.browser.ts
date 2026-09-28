import { describe, expect, it } from 'vitest';
import { readIslandRecords, resolveIslandElement } from './read-island-records.ts';

describe('readIslandRecords', () => {
	it('deduplicates by component ID in favor of island container and preserves standalone elements', () => {
		document.body.innerHTML = `
			<div data-eco-island data-eco-component-id="inst-1">
				<eco-island data-eco-island data-eco-component-id="inst-1"></eco-island>
			</div>
			<eco-island data-eco-island data-eco-component-key="standalone-1"></eco-island>
			<eco-island data-eco-island data-eco-component-key="standalone-2"></eco-island>
		`;

		const records = readIslandRecords(document);
		expect(records).toHaveLength(3);
		expect(records[0].componentId).toBe('inst-1');
		expect(records[0].hostTag).toBe('eco-island');
		expect(records[1].componentKey).toBe('standalone-1');
		expect(records[2].componentKey).toBe('standalone-2');
	});

	it('respects integration metadata over componentKey for island kind', () => {
		document.body.innerHTML = `
			<my-lit-island data-eco-island data-eco-island-integration="lit" data-eco-component-key="lit-counter"></my-lit-island>
			<eco-island data-eco-island data-eco-component-key="react-counter"></eco-island>
		`;

		const records = readIslandRecords(document);
		expect(records).toHaveLength(2);
		expect(records[0].kind).toBe('integration');
		expect(records[0].integration).toBe('lit');
		expect(records[1].kind).toBe('react-island');
	});

	it('determines integration-specific lifecycle status for React, Lit, and custom elements', () => {
		class TestRegisteredCustomElement extends HTMLElement {}
		if (!customElements.get('test-toolbar-registered')) {
			customElements.define('test-toolbar-registered', TestRegisteredCustomElement);
		}

		class TestLitHydratedElement extends HTMLElement {
			hasUpdated = true;
		}
		if (!customElements.get('test-toolbar-lit-hydrated')) {
			customElements.define('test-toolbar-lit-hydrated', TestLitHydratedElement);
		}

		document.body.innerHTML = `
			<eco-island data-eco-island data-eco-island-integration="react" data-eco-component-id="react-unhydrated"></eco-island>
			<eco-island data-eco-island data-eco-island-integration="react" data-eco-hydrated="true" data-eco-component-id="react-hydrated"></eco-island>
			<test-toolbar-lit-hydrated data-eco-island data-eco-island-integration="lit" defer-hydration></test-toolbar-lit-hydrated>
			<test-toolbar-lit-hydrated data-eco-island data-eco-island-integration="lit"></test-toolbar-lit-hydrated>
			<test-toolbar-registered data-eco-island data-eco-island-integration="ecopages-jsx"></test-toolbar-registered>
			<test-toolbar-unregistered data-eco-island data-eco-island-integration="ecopages-jsx"></test-toolbar-unregistered>
		`;

		const records = readIslandRecords(document);
		expect(records).toHaveLength(6);

		// React without data-eco-hydrated
		expect(records[0].status).toBe('ssr-only');
		expect(records[0].hydrated).toBe(false);

		// React with data-eco-hydrated
		expect(records[1].status).toBe('hydrated');
		expect(records[1].hydrated).toBe(true);

		// Lit with defer-hydration
		expect(records[2].status).toBe('registered');
		expect(records[2].hydrated).toBe(false);

		// Lit with completed initial update (hasUpdated = true)
		expect(records[3].status).toBe('hydrated');
		expect(records[3].hydrated).toBe(true);

		// Custom element registered without update completion signal: registered, not hydrated
		expect(records[4].status).toBe('registered');
		expect(records[4].hydrated).toBe(false);

		// Custom element not registered in customElements
		expect(records[5].status).toBe('ssr-only');
		expect(records[5].hydrated).toBe(false);
	});
});

describe('resolveIslandElement', () => {
	it('does not resolve a removed instance to a sibling with the same component key', () => {
		document.body.innerHTML = `
			<eco-island data-eco-component-id="first" data-eco-component-key="shared"></eco-island>
			<eco-island data-eco-component-id="second" data-eco-component-key="shared"></eco-island>
		`;
		const first = document.querySelector('[data-eco-component-id="first"]');
		if (!(first instanceof HTMLElement)) throw new Error('missing first island');
		first.remove();

		expect(
			resolveIslandElement(
				{
					id: 'first',
					label: 'first',
					componentId: 'first',
					componentKey: 'shared',
					hostTag: 'eco-island',
					kind: 'react-island',
					propsPreview: '',
					status: 'ssr-only',
					hydrated: false,
					targetSelector: '[data-eco-component-key="shared"]',
				},
				document,
			),
		).toBeNull();
	});
});
