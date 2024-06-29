import { DepsManager } from '@ecopages/core';
import './lit-counter.script';

export const LitCounter = {
  dependencies: DepsManager.collect({
    importMeta: import.meta,
    scripts: ['lit-counter.script.ts'],
  }),
};
