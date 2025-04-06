/**
 * This module contains the react plugin for Ecopages
 * @module
 */

import type { IntegrationRenderer } from '@ecopages/core';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { type AssetDependency, AssetDependencyHelpers } from '@ecopages/core/services/assets-dependency-service';
import { Logger } from '@ecopages/logger';
import type { JSX } from 'react';
import type React from 'react';
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
 * The React plugin class
 * This plugin provides support for React components in Ecopages
 */
export class ReactPlugin extends IntegrationPlugin<React.JSX.Element> {
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.tsx'],
      ...options,
    });

    this.dependencies = [...this.generateDependencies(), ...this.dependencies];

    appLogger.warn('React plugin alone does not support MDX files at this time.');
  }

  private buildImportMapSourceUrl(fileName: string): string {
    return `/${AssetDependencyHelpers.RESOLVED_ASSETS_DIR}/${fileName}`;
  }

  /**
   * Generate dependencies for processor.
   * It is ossible to define which one should be included in the final bundle based on the environment.
   * @returns
   */
  private generateDependencies(): AssetDependency[] {
    if (import.meta.env.NODE_ENV === 'development') {
      return [
        AssetDependencyHelpers.createInlineScriptAsset({
          position: 'head',
          content: JSON.stringify(
            {
              imports: {
                react: this.buildImportMapSourceUrl('react-dev-esm.js'),
                'react-dom/client': this.buildImportMapSourceUrl('react-dev-esm.js'),
                'react/jsx-dev-runtime': this.buildImportMapSourceUrl('react-dev-esm.js'),
                'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
              },
            },
            null,
            2,
          ),
          attributes: {
            type: 'importmap',
          },
        }),
        AssetDependencyHelpers.createNodeModuleScriptAsset({
          position: 'head',
          importPath: '@ecopages/react/react-dev-esm.ts',
          attributes: {
            type: 'module',
            defer: '',
          },
        }),
        AssetDependencyHelpers.createNodeModuleScriptAsset({
          position: 'head',
          importPath: '@ecopages/react/react-dom-esm.ts',
          attributes: {
            type: 'module',
            defer: '',
          },
        }),
      ];
    }

    return [
      AssetDependencyHelpers.createInlineScriptAsset({
        position: 'head',
        content: JSON.stringify(
          {
            imports: {
              react: this.buildImportMapSourceUrl('react-esm.js'),
              'react-dom/client': this.buildImportMapSourceUrl('react-esm.js'),
              'react/jsx-runtime': this.buildImportMapSourceUrl('react-esm.js'),
              'react-dom': this.buildImportMapSourceUrl('react-dom-esm.js'),
            },
          },
          null,
          2,
        ),
        attributes: {
          type: 'importmap',
          defer: '',
        },
      }),
      AssetDependencyHelpers.createNodeModuleScriptAsset({
        position: 'head',
        importPath: '@ecopages/react/react-esm.ts',
        attributes: {
          type: 'module',
          defer: '',
        },
      }),
      AssetDependencyHelpers.createNodeModuleScriptAsset({
        position: 'head',
        importPath: '@ecopages/react/react-dom-esm.ts',
        attributes: {
          type: 'module',
          defer: '',
        },
      }),
    ];
  }

  createRenderer(): IntegrationRenderer<JSX.Element> {
    if (!this.appConfig) {
      throw new Error('Plugin not initialized with app config');
    }

    return new ReactRenderer({
      appConfig: this.appConfig,
      assetsDependencyService: this.assetsDependencyService,
    });
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
