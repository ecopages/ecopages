import { DepsManager, type EcoComponent } from '@eco-pages/core';

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

Counter.dependencies = DepsManager.collect({ importMeta: import.meta });
