import { DepsManager } from '@eco-pages/core' with { type: 'macro' };
import './lit-counter.script';

export const LitCounter = {
  dependencies: DepsManager.importPaths({
    importMeta: import.meta,
    scripts: ['lit-counter.script.js'],
  }),
};
