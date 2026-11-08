import { eco, type EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import { SharedCounter } from '@/components/variant-shared/shared-counter';

export default eco.page({
	dependencies: {
		components: [SharedCounter],
	},
	render: () =>
		html`<main data-testid="page-variant-lit">${SharedCounter({ count: 6 })}</main>` as unknown as EcoPagesElement,
});
