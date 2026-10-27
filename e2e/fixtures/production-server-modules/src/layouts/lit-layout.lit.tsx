import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';

export const LitLayout = eco.layout({
	render: ({ children }) => html`<div data-layout="lit">${children}</div>` as unknown as EcoPagesElement,
});
