import { entries, getComponent } from 'ecopages:content/docs';
import type { Entry } from 'ecopages:content/docs';
import { DOCS_ROOT, DOCS_SECTION_CONFIG, DOCS_SECTION_ORDER, compareDocsEntries } from '@/content/docs';
import type { DocsContentPage, DocsContentSection, DocsSiteContent } from './docs-site-content.types';

function toPage(entry: Entry): DocsContentPage {
	const pageSlug = entry.segments[entry.segments.length - 1]!;

	return {
		slug: pageSlug,
		title: entry.title,
		description: entry.description,
		llms: entry.llms,
		content: getComponent(entry.slug),
	};
}

/** Builds docs-kit navigation and page modules from the content processor collection. */
export function buildDocsSiteContent(): DocsSiteContent {
	const pagesBySection = new Map<string, DocsContentPage[]>();

	for (const entry of [...entries].sort(compareDocsEntries)) {
		const sectionId = entry.segments[0]!;
		const pages = pagesBySection.get(sectionId) ?? [];
		pages.push(toPage(entry));
		pagesBySection.set(sectionId, pages);
	}

	const sections: DocsContentSection[] = DOCS_SECTION_ORDER.flatMap((sectionId) => {
		const pages = pagesBySection.get(sectionId);
		if (!pages || pages.length === 0) {
			return [];
		}

		const config = DOCS_SECTION_CONFIG[sectionId];

		return [
			{
				id: sectionId,
				title: config.title,
				icon: config.icon,
				pages,
			},
		];
	});

	return {
		rootDir: DOCS_ROOT,
		sections,
	};
}
