import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter = eco.component<LitCounterProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './lit-counter.script.ts', ssr: true }],
	},
	render: ({ count = 0 }) => {
		return <lit-counter count={count}></lit-counter>;
	},
});
