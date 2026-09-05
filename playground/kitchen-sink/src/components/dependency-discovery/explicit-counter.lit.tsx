import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';

export const ExplicitDiscoveryCounter = eco.component({
	dependencies: {
		stylesheets: ['./counter.css'],
		scripts: [{ src: './counter.script.ts', ssr: true, lazy: { 'on:visible': true } }],
	},
	render: () =>
		html`<div class="discovery-counter-host">
			<discovery-counter></discovery-counter>
		</div>` as unknown as EcoPagesElement,
});
