import { type IntegrationPlugin, appLogger } from '@eco-pages/core';
import { ReactRenderer } from './react-renderer';

export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

export const PLUGIN_NAME = 'react';

export function reactPlugin(options?: ReactPluginOptions): IntegrationPlugin {
  const { extensions = ['.tsx'], dependencies = [] } = options || {};
  appLogger.warn('reactPlugin is currently in an experimental phase and does not support MDX files at this time.');
  return {
    name: PLUGIN_NAME,
    extensions,
    renderer: ReactRenderer,
    dependencies,
  };
}
