import type { DocsContentPage } from '@/docs-kit/content/docs-site-content.types';
import { getDocsKit } from '@/docs-kit/config';

export type ResolvedDocsNavPage = DocsContentPage & {
	section: string;
};

export function resolveDocsNavPage(section: string, slug: string): ResolvedDocsNavPage {
	const sectionEntry = getDocsKit().content.sections.find((entry) => entry.id === section);
	const page = sectionEntry?.pages.find((entry) => entry.slug === slug);

	if (!page) {
		throw new Error(`Unknown docs page: ${section}/${slug}`);
	}

	return { section, ...page };
}
