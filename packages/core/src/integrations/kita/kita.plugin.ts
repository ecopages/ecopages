import type { IntegrationPlugin } from '../registerIntegration';
import { KitaRenderer } from './kita-renderer';

export const kitaPlugin: IntegrationPlugin = {
  name: 'kita',
  renderer: KitaRenderer,
};
