import { eco } from '@ecopages/core';
import { ServerDomLitProbe } from '../components/server-dom-lit-probe.lit';

export default eco.page({
	cache: 'dynamic',
	render: () => (
		<main>
			<h1>Kita with Lit</h1>
			<ServerDomLitProbe />
		</main>
	),
});
