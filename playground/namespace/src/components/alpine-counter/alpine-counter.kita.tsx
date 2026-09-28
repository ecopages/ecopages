import { eco } from '@ecopages/core';

export type AlpineCounterProps = {
	count?: number;
};

export const AlpineCounter = eco.component<AlpineCounterProps>({
	dependencies: {
		stylesheets: ['./alpine-counter.css'],
		scripts: [{ src: './alpine-counter.script.ts', lazy: { 'on:visible': true } }],
	},
	render: ({ count = 0 }) => (
		<div class="alpine-counter" x-data="counter">
			<button aria-label="Decrement" class="alpine-counter__decrement" {...{ '@click': 'decrement' }}>
				-
			</button>
			<span x-text="count">{count}</span>
			<button aria-label="Increment" class="alpine-counter__increment" {...{ '@click': 'increment' }}>
				+
			</button>
		</div>
	),
});
