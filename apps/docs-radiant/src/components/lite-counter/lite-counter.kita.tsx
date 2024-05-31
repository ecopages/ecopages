import { DepsManager, type EcoComponent } from '@ecopages/core';
import type { LiteCounterProps } from './lite-counter.script';

export const LiteCounter: EcoComponent<LiteCounterProps> = ({ value }) => {
  return (
    <lite-counter value={value}>
      <button type="button" data-ref="decrement" aria-label="Decrement">
        -
      </button>
      <span data-ref="count">{value}</span>
      <button type="button" data-ref="increment" aria-label="Increment">
        +
      </button>
    </lite-counter>
  );
};

LiteCounter.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lite-counter.script.ts'],
  stylesheets: ['./lite-counter.css'],
});
