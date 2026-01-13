import { eco } from '@ecopages/core';
import type { LitCounterProps } from './lit-counter.script';
import './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps>({
	dependencies: {
		stylesheets: ['./lit-counter.css'],
		lazy: {
			'on:interaction': 'mouseenter,click',
			scripts: ['./lit-counter.script.ts'],
		},
	},
	render: ({ count = 0 }) => <lit-counter count={count}></lit-counter>,
});
