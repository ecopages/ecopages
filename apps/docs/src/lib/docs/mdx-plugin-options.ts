import type { Pluggable } from 'unified';
import { withContentMdxPlugins } from '@ecopages/content-processor/mdx';
import { transformerCopyButton } from '@rehype-pretty/transformers';
import remarkGfm from 'remark-gfm';
import rehypePrettyCode from 'rehype-pretty-code';
import { remarkMermaid } from '../../../../../examples/recipes/diagrams/src/lib/remark-mermaid';
import { remarkSnippetInclude } from './snippet-include';
import { rehypeHeadingIds } from './rehype-heading-ids';
import { DOCS_SHIKI_THEMES } from './shiki-themes';
import { rehypePrettyCopyCompatibility } from './rehype-pretty-copy-compatibility';

const rehypePlugins = [
	rehypeHeadingIds,
	[
		rehypePrettyCode,
		{
			theme: DOCS_SHIKI_THEMES,
			defaultLang: { block: 'text' },
			transformers: [transformerCopyButton()],
		},
	],
	rehypePrettyCopyCompatibility,
] satisfies Pluggable[];

/** MDX plugin options wired into `ecopagesJsxPlugin({ mdx: docsMdxPluginOptions })`. */
export const docsMdxPluginOptions = {
	...withContentMdxPlugins({
		remarkPlugins: [remarkGfm, remarkMermaid, remarkSnippetInclude],
		rehypePlugins,
	}),
};
