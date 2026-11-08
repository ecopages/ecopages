/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';
import styles, { primary } from './button.module.css';

export const ReactButton = eco.component<{}, ReactNode>({
	render: () => {
		const [count, setCount] = useState(0);

		return (
			<button
				type="button"
				data-testid="react-button"
				className={primary}
				data-classes={Object.keys(styles).join()}
				onClick={() => setCount((value) => value + 1)}
			>
				React {count}
			</button>
		);
	},
});
