import { eco } from '@ecopages/core';
import { ServerDomLitProbe } from '../components/server-dom-lit-probe.lit';
import { ServerDomRadiantProbe } from '../components/server-dom-radiant-probe';

export default eco.page({
	cache: 'dynamic',
	render: () => (
		<main>
			<h1>Kita with Lit and Radiant</h1>
			<ServerDomLitProbe />
			<ServerDomRadiantProbe />
		</main>
	),
});
