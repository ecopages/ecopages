import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { LitLayout } from '../layouts/lit-layout.lit';
import './hello.script.ts';

export default eco.page({
	layout: LitLayout,
	metadata: () => ({ title: 'Lit static' }),
	dependencies: {
		scripts: [{ src: './hello.script.ts', ssr: true, lazy: { 'on:visible': true } }],
	},
	render: () =>
		html`<h1>lit-static</h1>
			<hello-ssr></hello-ssr>` as unknown as EcoPagesElement,
});
