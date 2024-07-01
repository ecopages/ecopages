import './lit-counter.script';

export const LitCounter = {
  config: {
    dependencies: {
      importMeta: import.meta,
      scripts: ['lit-counter.script.ts'],
    },
  },
};
