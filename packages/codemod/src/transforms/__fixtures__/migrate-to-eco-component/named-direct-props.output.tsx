import { eco } from '@ecopages/core';

type CounterProps = { count: number };

export const Counter = eco.component<CounterProps>({
	dependencies: {
		scripts: ['./counter.script.ts'],
	},

	render: ({ count }) => <span>{count}</span>,
});
