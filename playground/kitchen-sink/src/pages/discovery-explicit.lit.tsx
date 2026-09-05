import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { ExplicitDiscoveryCounter } from '@/components/dependency-discovery/explicit-counter.lit';

export default eco.page({
	dependencies: { components: [ExplicitDiscoveryCounter] },
	render: () =>
		html`<main>
			<h1>Explicit dependencies</h1>
			<div style="height:250vh"></div>
			${ExplicitDiscoveryCounter({})}
		</main>` as unknown as EcoPagesElement,
});
