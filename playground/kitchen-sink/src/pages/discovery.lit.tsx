import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { DiscoveryCounter } from '@/components/dependency-discovery/counter.lit';

export default eco.page({
	render: () =>
		html`<main>
			<h1>Inferred dependencies</h1>
			<div style="height:250vh"></div>
			${DiscoveryCounter({})}
		</main>` as unknown as EcoPagesElement,
});
