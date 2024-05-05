import type { IntegrationPlugin } from '@eco-pages/core';
import { KitaRenderer } from './kitajs-renderer';

export type KitaPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export const PLUGIN_NAME = 'kitajs';

export function kitajsPlugin(options?: KitaPluginOptions): IntegrationPlugin {
  const { extensions = ['.kita.tsx'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: KitaRenderer, dependencies };
}
