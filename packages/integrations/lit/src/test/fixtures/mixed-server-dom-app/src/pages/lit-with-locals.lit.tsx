import { eco } from '@ecopages/core';
import type { EcoPagesElement, FileRouteMiddleware } from '@ecopages/core';
import { html } from 'lit';
import { ServerDomLitProbe } from '../components/server-dom-lit-probe.lit';

const attachViewer: FileRouteMiddleware = async (ctx, next) => {
	(ctx.locals as { viewer?: string }).viewer = 'ada';
	return next();
};

export default eco.page<{}, EcoPagesElement>({
	cache: 'dynamic',
	integration: 'lit',
	middleware: [attachViewer],
	render: ({ locals }) =>
		html`<main>
			<p data-viewer>${(locals as { viewer?: string }).viewer}</p>
			${eco.embed(ServerDomLitProbe)}
		</main>` as unknown as EcoPagesElement,
});
