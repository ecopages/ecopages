import type { IntegrationPlugin } from '@types';
import { LitRenderer } from './lit-renderer';

export const litPlugin: IntegrationPlugin = {
  name: 'lit',
  descriptor: 'lit',
  extensions: ['tsx', 'ts'],
  renderer: LitRenderer,
  dependencies: {
    scripts: [
      {
        position: 'head',
        importPath: '@lit-labs/ssr-client/lit-element-hydrate-support.js',
      },
    ],
  },
};
