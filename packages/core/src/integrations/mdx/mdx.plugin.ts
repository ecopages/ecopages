import type { IntegrationPlugin } from '@types';
import { MDXRenderer } from './mdx-renderer';

export type MDXPluginOptions = {
  extensions: string[];
  dependencies: IntegrationPlugin['dependencies'];
};

export function mdxPlugin(options?: MDXPluginOptions): IntegrationPlugin {
  const { extensions = ['.mdx'], dependencies = [] } = options || {};
  return { name: 'MDX', extensions, renderer: MDXRenderer, dependencies };
}
