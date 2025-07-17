import { type EcoComponent, html } from '@ecopages/core';

export type CardProps = {
	title: string;
	copy: string;
};

export const Card: EcoComponent<CardProps> = ({ copy, title }) => {
	return html`
    <article class="card">
      <h1>${title}</h1>
      <p>${copy}</p>
    </article>
  `;
};

Card.config = {
	importMeta: import.meta,
	dependencies: { stylesheets: ['./card.css'] },
};
