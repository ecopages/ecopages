import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps, EcoPagesElement>({
	integration: 'lit',
	dependencies: {
		scripts: ['./lit-counter.script.ts'],
	},
	render: ({ count = 0 }) => <lit-counter count={count}></lit-counter>,
});
