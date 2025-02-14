import type { EcoComponent } from '@ecopages/core';
import type { RadiantCounterProps } from './radiant-counter.script';

export const RadiantCounter: EcoComponent<RadiantCounterProps> = ({ value = 5 }) => {
  return (
    <radiant-counter value={value} class="counter">
      <button type="button" data-ref="decrement" aria-label="Decrement" className="decrement">
        -
      </button>
      <span data-ref="count">{value}</span>
      <button type="button" data-ref="increment" aria-label="Increment" className="increment">
        +
      </button>
    </radiant-counter>
  );
};

RadiantCounter.config = {
  importMeta: import.meta,
  dependencies: {
    scripts: ['./radiant-counter.script.js'],
  },
};
