/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';
import { kitClass } from '@ecopages/e2e-package-css-lib/kit';

export const KitLibButton = eco.component<{}, ReactNode>({
	render: () => {
		const [count, setCount] = useState(0);

		return (
			<button
				type="button"
				data-testid="kit-lib-react"
				className={kitClass}
				onClick={() => setCount((value) => value + 1)}
			>
				Kit lib {count}
			</button>
		);
	},
});
