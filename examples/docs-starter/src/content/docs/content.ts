import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';
import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';

import GettingStartedIntroduction from './getting-started/introduction.mdx';
import GettingStartedNextSteps from './getting-started/next-steps.mdx';
import { docsSiteContentMeta } from './content.meta';

const stub: DocsMdxComponent = () => null;

const contentByKey = new Map<string, DocsMdxComponent>([
	['getting-started/introduction', GettingStartedIntroduction],
	['getting-started/next-steps', GettingStartedNextSteps],
]);

/** Docs navigation, metadata, and MDX modules — single source of truth. */
export const docsSiteContent = {
	rootDir: docsSiteContentMeta.rootDir,
	sections: docsSiteContentMeta.sections.map((section) => ({
		...section,
		pages: section.pages.map((page) => ({
			...page,
			content: contentByKey.get(`${section.id}/${page.slug}`) ?? stub,
		})),
	})),
} satisfies DocsSiteContent;
