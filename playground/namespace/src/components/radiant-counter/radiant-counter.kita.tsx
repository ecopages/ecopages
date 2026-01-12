/**
 * Radiant Counter - using eco.component() with lazy loading
 */
import { eco } from '@ecopages/core';
import type { RadiantCounterProps } from './radiant-counter.script.ts';

export const RadiantCounter = eco.component<RadiantCounterProps>({
	dependencies: {
		stylesheets: ['./radiant-counter.css'],
		lazy: {
			'on:interaction': 'mouseenter,click',
			scripts: ['./radiant-counter.script.ts'],
		},
	},
	render: ({ count = 0 }) => (
		<radiant-counter count={count}>
			<button type="button" data-ref="decrement" aria-label="Decrement">
				-
			</button>
			<span data-ref="count">{count}</span>
			<button type="button" data-ref="increment" aria-label="Increment">
				+
			</button>
		</radiant-counter>
	),
});
