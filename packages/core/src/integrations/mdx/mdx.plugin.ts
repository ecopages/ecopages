import type { IntegrationPlugin } from '@types';
import { MDXRenderer } from './mdx-renderer';

export const mdxPlugin: IntegrationPlugin = {
  name: 'MDX',
  extensions: ['.mdx'],
  renderer: MDXRenderer,
  dependencies: [],
};
