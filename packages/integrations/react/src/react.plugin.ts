import type { IntegrationPlugin } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import { ReactRenderer } from './react-renderer';

const appLogger = new Logger('[@ecopages/react]');

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
    dependencies: [
      {
        kind: 'script',
        position: 'head',
        importPath: '@ecopages/react/src/react-esm.ts',
      },
      {
        kind: 'script',
        position: 'head',
        importPath: '@ecopages/react/src/react-dev-esm.ts',
      },
      ...dependencies,
    ],
  };
}
