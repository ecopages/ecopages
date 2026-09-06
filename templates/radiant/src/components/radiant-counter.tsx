import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import type { RadiantCounterProps } from './radiant-counter.script';
import './radiant-counter.css';

export const RadiantCounter = eco.component<RadiantCounterProps, JsxRenderable>({
	dependencies: {
		scripts: [{ src: './radiant-counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},
	render: ({ count = 0 }) => (
		<radiant-counter count={count}>
			<button type="button" class="counter__step" data-ref="decrement" aria-label="Decrement">
				-
			</button>
			<span data-ref="count">{count}</span>
			<button type="button" class="counter__step" data-ref="increment" aria-label="Increment">
				+
			</button>
		</radiant-counter>
	),
});
