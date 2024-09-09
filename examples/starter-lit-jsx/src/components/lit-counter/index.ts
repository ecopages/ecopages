import './lit-counter.script';

export const LitCounter = {
  config: {
    importMeta: import.meta,
    dependencies: {
      scripts: ['lit-counter.script.ts'],
    },
  },
};
