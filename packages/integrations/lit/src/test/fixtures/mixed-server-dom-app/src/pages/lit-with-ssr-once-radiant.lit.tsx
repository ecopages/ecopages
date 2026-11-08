import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { SsrOnceRadiantProbe } from '../components/ssr-once-radiant-probe';

export default eco.page<{}, EcoPagesElement>({
	cache: 'dynamic',
	integration: 'lit',
	render: () =>
		html`<main>
			<h1>Lit with a Radiant script</h1>
			${eco.embed(SsrOnceRadiantProbe)}
		</main>` as unknown as EcoPagesElement,
});
