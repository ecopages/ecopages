import type { EcoComponent } from '@ecopages/core';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter: EcoComponent<RadiantCounterProps> = ({ count, ...props }) => {
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
};

RadiantCounter.config = {
	dependencies: {
		scripts: ['./radiant-counter.script.ts'],
		stylesheets: ['./radiant-counter.css'],
	},
};
