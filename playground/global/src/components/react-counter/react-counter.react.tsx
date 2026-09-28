/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';

export type ReactCounterProps = {
	count?: number;
};

export const ReactCounter = eco.component<ReactCounterProps, ReactNode>({
	integration: 'react',
	dependencies: {
		stylesheets: ['./react-counter.css'],
	},
	render: ({ count = 0 }) => {
		const [internalCount, setInternalCount] = useState(count);

		const increment = () => setInternalCount((c) => c + 1);
		const decrement = () => setInternalCount((c) => c - 1);

		return (
			<div className="react-counter">
				<button className="react-counter__decrement" type="button" aria-label="Decrement" onClick={decrement}>
					-
				</button>
				<span>{internalCount}</span>
				<button className="react-counter__increment" type="button" aria-label="Increment" onClick={increment}>
					+
				</button>
			</div>
		);
	},
});
