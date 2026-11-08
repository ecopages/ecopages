/** @jsxImportSource @ecopages/jsx */
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import styles from './badge.module.css';

export const Badge = eco.component<{}, JsxRenderable>({
	render: () => (
		<span data-testid="eco-jsx-badge" class={styles.label}>
			Eco JSX
		</span>
	),
});
