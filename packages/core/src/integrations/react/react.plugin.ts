import type { IntegrationPlugin } from '@eco-pages/core';
import { ReactRenderer } from './react-renderer';

export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export function reactPlugin(options?: ReactPluginOptions): IntegrationPlugin {
  const { extensions = ['.tsx'], dependencies = [] } = options || {};
  return {
    name: 'react',
    extensions,
    renderer: ReactRenderer,
    dependencies,
  };
}
