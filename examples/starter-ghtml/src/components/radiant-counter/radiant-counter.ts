import { type EcoComponent, html } from '@ecopages/core';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter: EcoComponent<RadiantCounterProps> = ({ count }) =>
	html`<radiant-counter count="${count}">
		<button type="button" data-ref="decrement" aria-label="Decrement">-</button>
		<span data-ref="count">${count}</span>
		<button type="button" data-ref="increment" aria-label="Increment">+</button>
	</radiant-counter>`;

RadiantCounter.config = {
	dependencies: {
		scripts: ['./radiant-counter.script.ts'],
		stylesheets: ['./radiant-counter.css'],
	},
};
