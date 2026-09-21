import { eco } from '@ecopages/core';

export const LitCounter = eco.component<{ count: number }>({
	dependencies: {
		scripts: [{ src: './lit-counter.script.ts', ssr: true }],
	},
	render({ count }) {
		return <lit-counter count={count}></lit-counter>;
	},
});
