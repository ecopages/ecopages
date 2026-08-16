import { eco } from '@ecopages/core';

export const LitCounter = eco.component<{ count: number }>({
	dependencies: {
		scripts: ['./lit-counter.script.ts'],
	},
	render({ count }) {
		return <lit-counter count={count}></lit-counter>;
	},
});
