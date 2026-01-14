import { eco } from '@ecopages/core';
import { kitaKamakuraPng } from 'ecopages:images';
import { EcoImage } from '@ecopages/image-processor/component/html';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card = eco.component<CardProps>({
	dependencies: {
		stylesheets: ['./card.css'],
	},

	render: ({ copy, title }) => {
		return (
			<article class="card prose">
				<EcoImage {...kitaKamakuraPng} alt="Suiren (water lily) flower: Kita-kamakura" />
				<h1 safe>{title}</h1>
				<p>{copy as 'safe'}</p>
			</article>
		);
	},
});
