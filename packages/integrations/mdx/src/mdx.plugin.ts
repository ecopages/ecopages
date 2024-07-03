import type { IntegrationPlugin } from '@ecopages/core';
import { MDXRenderer } from './mdx-renderer.ts';

/**
 * Options for the MDX plugin
 */
export type MDXPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

/**
 * The name of the MDX plugin
 */
export const PLUGIN_NAME = 'MDX';

/**
 * Creates an MDX plugin
 * @param options - The options for the plugin
 * @returns The MDX plugin
 */
export function mdxPlugin(options?: MDXPluginOptions): IntegrationPlugin {
  const { extensions = ['.mdx'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: MDXRenderer, dependencies };
}
