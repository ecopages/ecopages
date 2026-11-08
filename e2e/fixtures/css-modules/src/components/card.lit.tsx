import { eco } from '@ecopages/core';
import type { EcoPagesElement } from '@ecopages/core';
import { html } from 'lit';
import styles from './card.module.css';

export const LitCard = eco.component<{}, EcoPagesElement>({
	dependencies: {
		scripts: [{ src: './card.script.ts', ssr: true }],
	},
	render: () =>
		html`<css-modules-card
			data-testid="lit-card-host"
			class=${styles.card}
		></css-modules-card>` as unknown as EcoPagesElement,
});
