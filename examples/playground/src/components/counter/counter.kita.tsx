import type { EcoComponent } from '@ecopages/core';

export type CounterProps = {
  count?: number;
};

export const Counter: EcoComponent<CounterProps> = ({ count = 0 }) => {
  return (
    <div class="counter" x-data="counter">
      <button aria-label="Decrement" class="counter__decrement" {...{ '@click': 'decrement' }}>
        -
      </button>
      <span x-text="count">{count}</span>
      <button aria-label="Increment" class="counter__increment" {...{ '@click': 'increment' }}>
        +
      </button>
    </div>
  );
};

Counter.config = {
  importMeta: import.meta,
  dependencies: {
    scripts: ['./counter.script.ts'],
    stylesheets: ['./counter.css'],
  },
};
