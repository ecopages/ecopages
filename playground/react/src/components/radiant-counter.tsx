import { eco } from '@ecopages/core';
import type { ReactNode } from 'react';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter = eco.component<RadiantCounterProps, ReactNode>({
	dependencies: {
		scripts: ['./radiant-counter.script.ts'],
	},

	render: ({ value = 5 }) => {
		return (
			<radiant-counter value={value} class="counter">
				<button type="button" data-ref="decrement" aria-label="Decrement" className="decrement">
					-
				</button>
				<span data-ref="count">{value}</span>
				<button type="button" data-ref="increment" aria-label="Increment" className="increment">
					+
				</button>
			</radiant-counter>
		);
	},
});
