import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps, EcoPagesElement>({
	integration: 'lit',
	dependencies: {
		scripts: ['./lit-counter.script.ts'],
	},
	render: ({ count = 0 }) =>
		html`<lit-counter count=${count} data-counter-kind="lit"></lit-counter>` as unknown as EcoPagesElement,
});
