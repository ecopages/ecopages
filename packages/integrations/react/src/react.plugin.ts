import type { IntegrationPlugin } from '@ecopages/core';
import { Logger } from '@ecopages/logger';
import { ReactRenderer } from './react-renderer';

const appLogger = new Logger('[@ecopages/react]');

/**
 * Options for the React plugin
 */
export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: IntegrationPlugin['dependencies'];
};

/**
 * The name of the React plugin
 */
export const PLUGIN_NAME = 'react';

/**
 * Creates a React plugin
 * @param options - The options for the plugin
 * @returns The React plugin
 */
export function reactPlugin(options?: ReactPluginOptions): IntegrationPlugin {
  const { extensions = ['.tsx'], dependencies = [] } = options || {};
  appLogger.warn('reactPlugin alone does not support MDX files at this time.');
  return {
    name: PLUGIN_NAME,
    extensions,
    renderer: ReactRenderer,
    dependencies: [
      {
        kind: 'script',
        position: 'head',
        importPath: '@ecopages/react/react-esm.ts',
      },
      {
        kind: 'script',
        position: 'head',
        importPath: '@ecopages/react/react-dev-esm.ts',
      },
      {
        kind: 'script',
        position: 'head',
        importPath: '@ecopages/react/react-dom-esm.ts',
      },
      ...dependencies,
    ],
  };
}
