import type { IntegrationPlugin } from '@types';
import { KitaRenderer } from './kita-renderer';

export const kitaPlugin: IntegrationPlugin = {
  name: 'kita',
  descriptor: 'kita',
  extensions: ['tsx'],
  renderer: KitaRenderer,
  scriptsToInject: [
    {
      position: 'head',
      content: `console.log('Kita is running');`,
    },
  ],
};
