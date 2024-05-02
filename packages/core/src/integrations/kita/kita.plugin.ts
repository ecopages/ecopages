import type { IntegrationPlugin } from '@types';
import { KitaRenderer } from './kita-renderer';

export const kitaPlugin: IntegrationPlugin = {
  name: 'kita',
  extensions: ['.kita.tsx'],
  renderer: KitaRenderer,
  dependencies: [],
};
