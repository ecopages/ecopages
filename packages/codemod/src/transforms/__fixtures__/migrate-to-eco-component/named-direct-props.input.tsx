import type { EcoComponent } from '@ecopages/core';

type CounterProps = { count: number };

export const Counter: EcoComponent<CounterProps> = ({ count }) => <span>{count}</span>;
Counter.config = {
	dependencies: {
		scripts: ['./counter.script.ts'],
	},
};
