import { createMiddleware, eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { ServerDomLitProbe } from '../components/server-dom-lit-probe.lit';

const attachViewer = createMiddleware((_ctx, next) => next({ viewer: 'ada' }));

export default eco.page({
	cache: 'dynamic',
	integration: 'lit',
	middleware: [attachViewer],
	props: ({ locals }) => ({ viewer: locals.viewer }),
	render: ({ viewer }) =>
		html`<main>
			<p data-viewer>${viewer}</p>
			${eco.embed(ServerDomLitProbe)}
		</main>` as unknown as EcoPagesElement,
});
