/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcoEmbed } from '@ecopages/ecopages-jsx/eco-embed';
import { ServerDomLitProbe } from '../components/server-dom-lit-probe.lit';

export default eco.page<{}, JsxRenderable>({
	cache: 'dynamic',
	integration: 'ecopages-jsx',
	render: () => (
		<main>
			<h1>JSX with Lit</h1>
			<EcoEmbed component={ServerDomLitProbe} props={{}} />
		</main>
	),
});
