import { eco } from '@ecopages/core';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter = eco.component<RadiantCounterProps>({
	dependencies: {
		stylesheets: ['./radiant-counter.css'],
		scripts: [{ src: './radiant-counter.script.ts', lazy: { 'on:interaction': 'mouseenter,focusin' } }],
	},

	render: ({ count, ...props }) => {
		return (
			<radiant-counter count={count} {...props}>
				<button type="button" data-ref="decrement" aria-label="Decrement">
					-
				</button>
				<span data-ref="count">{count}</span>
				<button type="button" data-ref="increment" aria-label="Increment">
					+
				</button>
			</radiant-counter>
		);
	},
});
