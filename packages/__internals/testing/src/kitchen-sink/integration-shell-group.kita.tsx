/** @jsxImportSource @kitajs/html */
import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';

type IntegrationShellGroupProps = {
	testId: string;
};

/**
 * @remarks
 * A Kita component can only embed components typed as `EcoPagesElement`, so
 * the Lit result is cast, as the kitchen-sink Lit components do.
 */
const LitLeaf = eco.component<{ id: string }, EcoPagesElement>({
	integration: 'lit',
	render: ({ id }) => html`<span data-lit-leaf=${id}>Lit leaf</span>` as unknown as EcoPagesElement,
});

export const IntegrationShellGroup = eco.component<IntegrationShellGroupProps, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		components: [LitLeaf],
	},
	render: ({ testId }) => (
		<div data-testid={testId}>
			<LitLeaf id="group-lit" />
		</div>
	),
});
