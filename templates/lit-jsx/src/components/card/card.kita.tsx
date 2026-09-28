import { eco } from '@ecopages/core';
import { LitCounter } from '@/components/lit-counter';
import './card.css';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card = eco.component<CardProps>({
	render: ({ copy, title }) => {
		return (
			<article class="card prose">
				<h1 safe>{title}</h1>
				<p>{copy as 'safe'}</p>
				<LitCounter count={8} />
			</article>
		);
	},
});
