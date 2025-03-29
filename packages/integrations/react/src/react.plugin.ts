/**
 * This module contains the react plugin for Ecopages
 * @module
 */

import type { IntegrationRenderer } from '@ecopages/core';
import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { type Dependency, DependencyHelpers } from '@ecopages/core/services/dependency-service';
import { Logger } from '@ecopages/logger';
import type { JSX } from 'react';
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
export class ReactPlugin extends IntegrationPlugin {
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.tsx'],
    });

    this.dependencies = [...this.generateDependencies(), ...this.dependencies];

    appLogger.warn('React plugin alone does not support MDX files at this time.');
  }

  /**
   * Generate dependencies for processor.
   * It is ossible to define which one should be included in the final bundle based on the environment.
   * @returns
   */
  private generateDependencies(): Dependency[] {
    if (import.meta.env.NODE_ENV === 'development') {
      return [
        DependencyHelpers.createInlineScriptDependency({
          position: 'head',
          content: JSON.stringify(
            {
              imports: {
                react: '/__dependencies__/react-dev-esm.js',
                'react-dom/client': '/__dependencies__/react-dev-esm.js',
                'react/jsx-dev-runtime': '/__dependencies__/react-dev-esm.js',
                'react-dom': '/__dependencies__/react-dom-esm.js',
              },
            },
            null,
            2,
          ),
          attributes: {
            type: 'importmap',
          },
        }),
        DependencyHelpers.createNodeModuleScriptDependency({
          position: 'head',
          importPath: '@ecopages/react/react-dev-esm.ts',
          attributes: {
            type: 'module',
            defer: '',
          },
        }),
        DependencyHelpers.createNodeModuleScriptDependency({
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
      DependencyHelpers.createInlineScriptDependency({
        position: 'head',
        content: JSON.stringify(
          {
            imports: {
              react: '/__dependencies__/react-esm.js',
              'react-dom/client': '/__dependencies__/react-esm.js',
              'react/jsx-runtime': '/__dependencies__/react-esm.js',
              'react-dom': '/__dependencies__/react-dom-esm.js',
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
      DependencyHelpers.createNodeModuleScriptDependency({
        position: 'head',
        importPath: '@ecopages/react/react-esm.ts',
        attributes: {
          type: 'module',
          defer: '',
        },
      }),
      DependencyHelpers.createNodeModuleScriptDependency({
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
