import type { EcoWebComponent } from '@ecopages/core';
import './lit-counter.script';

export const LitCounter: EcoWebComponent = {
  config: {
    importMeta: import.meta,
    dependencies: {
      scripts: ['lit-counter.script.ts'],
    },
  },
};
