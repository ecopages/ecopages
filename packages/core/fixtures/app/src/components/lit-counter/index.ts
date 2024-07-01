import './lit-counter.script';

export const LitCounter = {
  config: {
    importMeta: import.meta,
    dependencies: {
      importMeta: import.meta,
      scripts: ['lit-counter.script.ts'],
    },
  },
};
