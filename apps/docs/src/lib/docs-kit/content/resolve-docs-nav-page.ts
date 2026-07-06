import type { DocsContentPage } from '@/lib/docs-kit/content/docs-site-content.types';
import { getDocsKit } from '@/lib/docs-kit/config';

export type ResolvedDocsNavPage = DocsContentPage & {
	section: string;
};

/** Resolves configured content metadata for a section/slug pair. */
export function resolveDocsNavPage(section: string, slug: string): ResolvedDocsNavPage {
	const sectionEntry = getDocsKit().content.sections.find((entry) => entry.id === section);
	const page = sectionEntry?.pages.find((entry) => entry.slug === slug);

	if (!page) {
		throw new Error(`Unknown docs page: ${section}/${slug}`);
	}

	return { section, ...page };
}
