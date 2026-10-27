import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { ServerDomRadiantProbe } from '../components/server-dom-radiant-probe';

export default eco.page<{}, EcoPagesElement>({
	cache: 'dynamic',
	integration: 'lit',
	render: () =>
		html`<main>
			<h1>Lit with Radiant</h1>
			${eco.embed(ServerDomRadiantProbe)}
		</main>` as unknown as EcoPagesElement,
});
