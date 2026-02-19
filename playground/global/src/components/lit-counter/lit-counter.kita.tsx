import { eco } from '@ecopages/core';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps>({
	dependencies: {
		lazy: {
			'on:interaction': 'click,mouseenter,focusin',
			scripts: ['./lit-counter.script.ts'],
		},
	},
	render: ({ count = 0 }) => {
		return <lit-counter count={count}></lit-counter>;
	},
});
