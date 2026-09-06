import { eco } from '@ecopages/core';
import { html } from 'lit';
import { BarrelWidget } from '@/components/dependency-discovery/barrel';

export default eco.page({
	render: () =>
		html`<main>
			<h1>Barrel discovery</h1>
			${BarrelWidget({})}
		</main>`,
});
