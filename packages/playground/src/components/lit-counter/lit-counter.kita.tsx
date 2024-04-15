import { DepsManager, type EcoComponent } from '@eco-pages/core';
import type { LitCounterProps } from './lit-counter.script';

export const LitCounter: EcoComponent<LitCounterProps> = ({ count }) => {
  return <lit-counter class="lit-counter" count={count}></lit-counter>;
};

LitCounter.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  scripts: ['./lit-counter.script.ts'],
});
