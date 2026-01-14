import { eco } from '@ecopages/core';
import { LitCounter } from '../lit-counter';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card = eco.component<CardProps>({
	dependencies: {
		stylesheets: ['./card.css'],
		components: [LitCounter],
	},

	render: ({ copy, title }) => {
		return (
			<article class="card prose">
				<h1 safe>{title}</h1>
				<p>{copy as 'safe'}</p>
				<lit-counter class="lit-counter" count={8}></lit-counter>
			</article>
		);
	},
});
