import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit/static-html.js';
import { LitCard } from '@/components/card.lit';

export default eco.page<{}, EcoPagesElement>({
	dependencies: {
		components: [LitCard],
	},
	metadata: () => ({
		title: 'CSS Modules in Lit',
		description: 'A CSS Module in a Lit component that renders on the server.',
	}),
	render: () => html`<main>${eco.embed(LitCard, {})}</main>`,
});
