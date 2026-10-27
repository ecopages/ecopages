/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { ServerDomRadiantProbe } from '../components/server-dom-radiant-probe';

export default eco.page<{}, JsxRenderable>({
	cache: 'dynamic',
	integration: 'ecopages-jsx',
	render: () => (
		<main>
			<h1>JSX with Radiant</h1>
			<ServerDomRadiantProbe />
		</main>
	),
});
