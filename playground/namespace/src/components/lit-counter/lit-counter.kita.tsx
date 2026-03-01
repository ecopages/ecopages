import { eco } from '@ecopages/core';
import type { LitCounterProps } from './lit-counter.script';
import './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps>({
	dependencies: {
		stylesheets: ['./lit-counter.css'],
		scripts: [
			{
				lazy: { 'on:interaction': 'click,mouseenter,focusin' },
				src: './lit-counter.script.ts',
				ssr: true,
			},
		],
	},
	render: ({ count = 0 }) => <lit-counter count={count}></lit-counter>,
});
