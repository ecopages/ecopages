import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { LitLayout } from '../layouts/lit-layout.lit';

export default eco.page({
	layout: LitLayout,
	metadata: () => ({ title: 'Lit view' }),
	render: () => html`<h1>lit-view</h1>` as unknown as EcoPagesElement,
});
