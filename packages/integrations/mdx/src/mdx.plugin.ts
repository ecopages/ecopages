import { IntegrationPlugin, type IntegrationPluginConfig } from '@ecopages/core/plugins/integration-plugin';
import { MDXRenderer } from './mdx-renderer.ts';

/**
 * The name of the MDX plugin
 */
export const PLUGIN_NAME = 'MDX';

/**
 * The MDX plugin class
 * This plugin provides support for MDX components in Ecopages
 */
export class MDXPlugin extends IntegrationPlugin {
  renderer = MDXRenderer;
  constructor(options?: Omit<IntegrationPluginConfig, 'name'>) {
    super({
      name: PLUGIN_NAME,
      extensions: ['.mdx'],
      ...options,
    });
  }
}

/**
 * Factory function to create a MDX plugin instance
 * @param options Configuration options for the MDX plugin
 * @returns A new MDXPlugin instance
 */
export function mdxPlugin(options?: Omit<IntegrationPluginConfig, 'name'>): MDXPlugin {
  return new MDXPlugin(options);
}
