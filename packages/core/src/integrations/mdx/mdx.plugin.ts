import type { IntegrationPlugin } from '@types';
import { MDXRenderer } from './mdx-renderer';

export const MDX_DESCRIPTOR = 'doc';

export const mdxPlugin: IntegrationPlugin = {
  name: MDX_DESCRIPTOR,
  descriptor: MDX_DESCRIPTOR,
  extensions: ['mdx'],
  renderer: MDXRenderer,
  dependencies: [],
};
