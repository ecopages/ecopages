import { DepsManager } from '@eco-pages/core';

export const ScriptInjector = {
  dependencies: DepsManager.importPaths({
    importMeta: import.meta,
    scripts: ['./script-injector.script.ts'],
  }),
};
