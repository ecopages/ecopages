import type { MDXComponents } from 'mdx/types.js';

/** MDX components available to every docs content module. */
export const docsMdxComponents = {} satisfies MDXComponents;

/** Returns the docs MDX component map for render calls. */
export function getDocsMdxComponents(): MDXComponents {
	return docsMdxComponents;
}
