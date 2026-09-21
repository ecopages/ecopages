import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter = eco.component<RadiantCounterProps, ReactNode>({
	dependencies: {
		scripts: [{ src: './radiant-counter.script.ts', ssr: true }],
	},
	render: ({ count = 5 }) => {
		return (
			<radiant-counter count={count} class="counter">
				<button type="button" data-ref="decrement" aria-label="Decrement" className="decrement">
					-
				</button>
				<span data-ref="count">{count}</span>
				<button type="button" data-ref="increment" aria-label="Increment" className="increment">
					+
				</button>
			</radiant-counter>
		);
	},
});
