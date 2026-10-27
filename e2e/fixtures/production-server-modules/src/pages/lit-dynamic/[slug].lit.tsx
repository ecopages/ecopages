import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { LitLayout } from '../../layouts/lit-layout.lit';

export default eco.page({
	layout: LitLayout,
	cache: 'dynamic',
	metadata: () => ({ title: 'Lit dynamic' }),
	render: ({ params }) => html`<h1>lit-dynamic ${String(params.slug)}</h1>` as unknown as EcoPagesElement,
});
