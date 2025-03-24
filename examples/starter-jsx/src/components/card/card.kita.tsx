import { kitaKamakuraPng } from 'ecopages:images';
import type { EcoComponent } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/html';

export type CardProps = {
  title: string;
  copy: string;
};

export const Card: EcoComponent<CardProps> = ({ copy, title }) => {
  return (
    <article class="card prose">
      <EcoImage {...kitaKamakuraPng} alt="Suiren (water lily) flower: Kita-kamakura" />
      <h1 safe>{title}</h1>
      <p>{copy as 'safe'}</p>
    </article>
  );
};

Card.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./card.css'],
  },
};
