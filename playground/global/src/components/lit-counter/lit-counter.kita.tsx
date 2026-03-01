import { eco } from '@ecopages/core';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps>({
	dependencies: {
		scripts: [
			{
				lazy: { 'on:interaction': 'click,mouseenter,focusin' },
				src: './lit-counter.script.ts',
				ssr: true,
			},
			{
				lazy: { 'on:idle': true },
				content: 'console.log("Idle script loaded")',
			},
		],
	},
	render: ({ count = 0 }) => {
		return <lit-counter count={count}></lit-counter>;
	},
});
