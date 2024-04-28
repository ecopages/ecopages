import type { IntegrationPlugin } from '@types';
import { KitaRenderer } from './kita-renderer';

export const KITA_DESCRIPTOR = 'kita';

export const kitaPlugin: IntegrationPlugin = {
  name: KITA_DESCRIPTOR,
  descriptor: KITA_DESCRIPTOR,
  extensions: ['tsx'],
  renderer: KitaRenderer,
  dependencies: [],
};
