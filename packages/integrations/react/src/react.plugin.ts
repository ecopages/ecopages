/**
 * This module contains the react plugin for Ecopages
 * @module
 */

import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { AssetDependencyHelpers, type AssetDependency } from '@ecopages/core/services/assets-dependency-service';
import { Logger } from '@ecopages/logger';
import type React from 'react';
import { ReactRenderer } from './react-renderer';

const appLogger = new Logger('[@ecopages/react]');

/**
 * Options for the React plugin
 */
export type ReactPluginOptions = {
  extensions?: string[];
  dependencies?: AssetDependency[];
};

/**
 * The name of the React plugin
 */
export const PLUGIN_NAME = 'react';

/**
 * The React plugin class
 * This plugin provides support for React components in Ecopages
 */
export class ReactPlugin extends IntegrationPlugin<React.JSX.Element> {
  renderer = ReactRenderer;

  constructor(options?: Omit<ReactPluginOptions, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.tsx'],
      ...options,
    });

    this.integrationDependencies.unshift(...this.getDependencies());

    appLogger.warn('React plugin alone does not support MDX files at this time.');
  }

  private buildImportMapSourceUrl(fileName: string): string {
    return `/${AssetDependencyHelpers.RESOLVED_ASSETS_VENDORS_DIR}/${fileName}`;
  }

  private getDependencies(): AssetDependency[] {
    return [
      AssetDependencyHelpers.createInlineContentScript({
        position: 'head',
        bundle: false,
        content: JSON.stringify(
          {
            imports: {
              react: this.buildImportMapSourceUrl('react-esm.js'),
              'react/jsx-runtime': this.buildImportMapSourceUrl('react-esm.js'),
              'react/jsx-dev-runtime': this.buildImportMapSourceUrl('react-esm.js'),
              'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
              'react-dom/client': this.buildImportMapSourceUrl('react-esm.js'),
            },
          },
          null,
          2,
        ),
        attributes: {
          type: 'importmap',
        },
      }),
      AssetDependencyHelpers.createNodeModuleScript({
        position: 'head',
        importPath: '@ecopages/react/react-esm.ts',
        name: 'react-esm',
        attributes: {
          type: 'module',
          defer: '',
        },
      }),
      AssetDependencyHelpers.createNodeModuleScript({
        position: 'head',
        importPath: '@ecopages/react/react-dom-esm.ts',
        name: 'react-dom-esm',
        attributes: {
          type: 'module',
          defer: '',
        },
      }),
    ];
  }
}

/**
 * Factory function to create a React plugin instance
 * @param options Configuration options for the React plugin
 * @returns A new ReactPlugin instance
 */
export function reactPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): ReactPlugin {
  return new ReactPlugin(options);
}
