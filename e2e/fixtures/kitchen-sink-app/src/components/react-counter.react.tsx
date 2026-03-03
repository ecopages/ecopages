/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';

export const ReactCounter = eco.component<{}, ReactNode>({
	integration: 'react',
	render: () => {
		const [count, setCount] = useState(0);
		return (
			<div data-react-counter>
				<button type="button" data-react-inc onClick={() => setCount((value) => value + 1)}>
					+
				</button>
				<span data-react-value>{count}</span>
			</div>
		);
	},
});
