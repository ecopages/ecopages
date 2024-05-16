import { DepsManager, type EcoComponent } from '@eco-pages/core';
import type { LiteCounterProps } from './lite-counter.script';

export const LiteCounter: EcoComponent<LiteCounterProps> = ({ value }) => {
  return (
    <lite-counter class="lite-counter" value={value}>
      <button type="button" data-decrement aria-label="Decrement" class="lite-counter__decrement">
        -
      </button>
      <span data-text="count">{value}</span>
      <button type="button" data-increment aria-label="Increment" class="lite-counter__increment">
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
