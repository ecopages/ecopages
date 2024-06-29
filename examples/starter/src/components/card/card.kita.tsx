import { type EcoComponent, resolveComponentsScripts } from '@ecopages/core';
import { LitCounter } from '../lit-counter';

export type CardProps = {
  title: string;
  copy: string;
};

export const Card: EcoComponent<CardProps> = ({ copy, title }) => {
  return (
    <article class="card prose">
      <h1 safe>{title}</h1>
      <p safe>{copy}</p>
      <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([LitCounter])}>
        <lit-counter class="lit-counter" count={8}></lit-counter>
      </scripts-injector>
    </article>
  );
};

Card.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./card.css'],
  },
};
