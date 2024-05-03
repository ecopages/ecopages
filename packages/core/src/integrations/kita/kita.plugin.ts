import type { IntegrationPlugin } from '@types';
import { KitaRenderer } from './kita-renderer';

export type KitaPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export function kitaPlugin(options?: KitaPluginOptions): IntegrationPlugin {
  const { extensions = ['.kita.tsx'], dependencies = [] } = options || {};
  return { name: 'kita', extensions, renderer: KitaRenderer, dependencies };
}
