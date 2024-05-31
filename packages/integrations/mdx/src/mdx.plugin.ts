import type { IntegrationPlugin } from '@ecopages/core';
import { MDXRenderer } from './mdx-renderer';

export type MDXPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

export const PLUGIN_NAME = 'MDX';

export function mdxPlugin(options?: MDXPluginOptions): IntegrationPlugin {
  const { extensions = ['.mdx'], dependencies = [] } = options || {};
  return { name: PLUGIN_NAME, extensions, renderer: MDXRenderer, dependencies };
}
