import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { KitaCounter } from './kita-counter.kita';
import { LitCounter } from './lit-counter.lit';
import { RadiantCounterComponent } from './radiant-counter.eco';
import { ReactCounter } from './react-counter.react';

type IntegrationCounterGroupProps = {
	testId: string;
	radiantId: string;
};

export const IntegrationCounterGroup = eco.component<IntegrationCounterGroupProps, EcoPagesElement>({
	integration: 'kitajs',
	dependencies: {
		components: [KitaCounter, LitCounter, ReactCounter, RadiantCounterComponent],
	},
	render: ({ testId, radiantId }) => (
		<div class="flex flex-wrap gap-3" data-testid={testId}>
			<KitaCounter />
			<LitCounter />
			<ReactCounter />
			<RadiantCounterComponent id={radiantId} />
		</div>
	),
});
