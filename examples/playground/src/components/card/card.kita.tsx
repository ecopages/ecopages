import { DepsManager, type EcoComponent } from '@ecopages/core';

export type CardProps = {
  title: string;
  copy: string;
};

export const Card: EcoComponent<CardProps> = ({ copy, title }) => {
  return (
    <article class="card">
      <h1 safe>{title}</h1>
      <p safe>{copy}</p>
    </article>
  );
};

Card.dependencies = DepsManager.collect({
  importMeta: import.meta,
  stylesheets: ['./card.css'],
});
