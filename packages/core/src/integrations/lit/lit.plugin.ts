import type { IntegrationPlugin } from '@types';
import { LitRenderer } from './lit-renderer';

export const LIT_DESCRIPTOR = 'lit';

export const litPlugin: IntegrationPlugin = {
  name: LIT_DESCRIPTOR,
  descriptor: LIT_DESCRIPTOR,
  extensions: ['tsx', 'ts'],
  renderer: LitRenderer,
  dependencies: [
    {
      kind: 'script',
      position: 'head',
      importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
    },
  ],
};
