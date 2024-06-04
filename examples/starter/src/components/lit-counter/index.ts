import { DepsManager, type EcoComponent } from '@ecopages/core';
import './lit-counter.script';

export const LitCounter = {
  dependencies: DepsManager.importPaths({
    importMeta: import.meta,
    scripts: ['lit-counter.script.js'],
  }),
};
