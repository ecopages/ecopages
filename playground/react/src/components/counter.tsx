import type { EcoComponent } from '@ecopages/core';
import { type JSX, useState } from 'react';

type CounterProps = {
	defaultValue: number;
};

export const Counter: EcoComponent<CounterProps, JSX.Element> = ({ defaultValue = 5 }) => {
	const [count, setCount] = useState<number>(defaultValue);
	const handleIncrement = () => setCount(count + 1);
	const handleDecrement = () => setCount(count - 1);

	return (
		<div className="counter">
			<button onClick={handleDecrement} aria-label="Decrement" type="button" className="decrement">
				-
			</button>
			<span>{count}</span>
			<button data-increment onClick={handleIncrement} aria-label="Increment" type="button" className="increment">
				+
			</button>
		</div>
	);
};

Counter.config = {
	dependencies: {
		stylesheets: ['./counter.css'],
	},
};
