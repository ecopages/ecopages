import type { MDXComponents } from 'mdx/types.js';
import { getDocsKit } from '@/docs-kit/config';

/** MDX components injected when rendering imported docs content modules. */
export function getDocsMdxComponents(): MDXComponents {
	return {
		...getDocsKit().mdxComponents,
	};
}
