import type { IntegrationPlugin } from '@eco-pages/core';
import { ReactRenderer } from './react-renderer';

export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export const PLUGIN_NAME = 'react';

export function reactPlugin(options?: ReactPluginOptions): IntegrationPlugin {
  const { extensions = ['.tsx'], dependencies = [] } = options || {};
  return {
    name: PLUGIN_NAME,
    extensions,
    renderer: ReactRenderer,
    dependencies,
  };
}
