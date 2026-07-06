import { EcoImage } from '@ecopages/image-processor/component/html';
import type { MDXComponents } from 'mdx/types.js';
import { getDocsKit } from '@/lib/docs-kit/config';

/** MDX components injected when rendering imported docs content modules. */
export function getDocsMdxComponents(): MDXComponents {
	return {
		...getDocsKit().mdxComponents,
		EcoImage,
	};
}
