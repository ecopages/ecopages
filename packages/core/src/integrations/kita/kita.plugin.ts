import type { IntegrationPlugin } from '@types';
import { KitaRenderer } from './kita-renderer';

export const KITA_DESCRIPTOR = 'kita';

export const kitaPlugin: IntegrationPlugin = {
  name: KITA_DESCRIPTOR,
  descriptor: KITA_DESCRIPTOR,
  extensions: ['tsx'],
  renderer: KitaRenderer,
  dependencies: [
    {
      kind: 'script',
      position: 'head',
      inline: true,
      content: `console.log('Kita is running');`,
    },
    {
      kind: 'script',
      position: 'head',
      inline: true,
      content: `console.log('Kita is running 2');`,
    },
    {
      kind: 'stylesheet',
      content: 'body { background-color: mediumturquoise; }',
    },
  ],
};
