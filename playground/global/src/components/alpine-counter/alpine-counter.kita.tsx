import type { EcoComponent } from '@ecopages/core';

export type AlpineCounterProps = {
	count?: number;
};

export const AlpineCounter: EcoComponent<AlpineCounterProps> = ({ count = 0 }) => {
	return (
		<div class="alpine-counter" x-data="counter">
			<button aria-label="Decrement" class="alpine-counter__decrement" {...{ '@click': 'decrement' }}>
				-
			</button>
			<span x-text="count">{count}</span>
			<button aria-label="Increment" class="alpine-counter__increment" {...{ '@click': 'increment' }}>
				+
			</button>
		</div>
	);
};

AlpineCounter.config = {
	importMeta: import.meta,
	dependencies: {
		scripts: ['./alpine-counter.script.ts'],
		stylesheets: ['./alpine-counter.css'],
	},
};
