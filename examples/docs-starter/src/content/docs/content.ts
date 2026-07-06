import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';

import { attachDocsContentModules } from './attach-docs-content-modules';
import { docsSiteContentMeta } from './content.meta';
import GettingStartedIntroduction from './getting-started/introduction.mdx';
import GettingStartedNextSteps from './getting-started/next-steps.mdx';

/** Docs navigation, metadata, and MDX modules — single source of truth. */
export const docsSiteContent = attachDocsContentModules(docsSiteContentMeta, {
	'getting-started/introduction': GettingStartedIntroduction,
	'getting-started/next-steps': GettingStartedNextSteps,
}) satisfies DocsSiteContent;
