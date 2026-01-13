import { eco } from '@ecopages/core';
import { html } from '@ecopages/core';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card = eco.component<CardProps>({
	dependencies: { stylesheets: ['./card.css'] },

	render: ({ copy, title }) => {
		return html`
			<article class="card">
				<h1>${title}</h1>
				<p>${copy}</p>
			</article>
		`;
	},
});
