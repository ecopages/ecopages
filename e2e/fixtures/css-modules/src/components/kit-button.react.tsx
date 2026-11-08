/** @jsxImportSource react */
import { eco } from '@ecopages/core';
import { useState, type ReactNode } from 'react';
import styles from '@ecopages/e2e-package-css-lib/button.module.css';

export const KitButton = eco.component<{}, ReactNode>({
	render: () => {
		const [count, setCount] = useState(0);

		return (
			<button
				type="button"
				data-testid="kit-button"
				className={styles.kit}
				onClick={() => setCount((value) => value + 1)}
			>
				Kit {count}
			</button>
		);
	},
});
