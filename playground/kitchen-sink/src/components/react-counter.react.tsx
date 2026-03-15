/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';

export const ReactCounter = eco.component<{}, ReactNode>({
	integration: 'react',
	dependencies: {
		stylesheets: ['./integration-counter.css', './react-counter.css'],
	},
	render: () => {
		const [count, setCount] = useState(0);

		return (
			<div className="integration-counter" data-react-counter>
				<button
					className="integration-counter__button"
					type="button"
					data-react-inc
					onClick={() => setCount((value) => value + 1)}
				>
					+
				</button>
				<span className="integration-counter__value" data-react-value>
					{count}
				</span>
			</div>
		);
	},
});
