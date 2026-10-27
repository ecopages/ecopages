import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import './server-dom-lit-probe.script.ts';

export const ServerDomLitProbe = eco.component<{}, EcoPagesElement>({
	integration: 'lit',
	dependencies: {
		scripts: [{ src: './server-dom-lit-probe.script.ts', ssr: true }],
	},
	render: () => html`<server-dom-lit-probe></server-dom-lit-probe>` as unknown as EcoPagesElement,
});
