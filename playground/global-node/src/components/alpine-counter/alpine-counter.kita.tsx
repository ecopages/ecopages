import { eco } from '@ecopages/core';

export type AlpineCounterProps = {
	count?: number;
};

export const AlpineCounter = eco.component<AlpineCounterProps>({
	dependencies: {
		stylesheets: ['./alpine-counter.css'],
		lazy: {
			'on:interaction': 'mouseenter,focusin',
			scripts: ['./alpine-counter.script.ts'],
		},
	},

	render: ({ count = 0 }) => {
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
	},
});
