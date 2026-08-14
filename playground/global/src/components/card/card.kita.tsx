import { eco } from '@ecopages/core';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card = eco.component<CardProps>({
	dependencies: { stylesheets: ['./card.css'] },

	render: ({ copy, title }) => (
		<article class="card">
			<h1>{title}</h1>
			<p>{copy}</p>
		</article>
	),
});
