/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';

export const Counter = eco.component<{}, ReactNode>({
	integration: 'react',
	render: () => {
		const [count, setCount] = useState(0);
		return (
			<button type="button" data-counter onClick={() => setCount((value) => value + 1)}>
				count {count}
			</button>
		);
	},
});
