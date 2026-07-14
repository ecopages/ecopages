import { entries } from 'ecopages:content/docs';
import {
	compareDocsEntries,
	DOCS_ROOT,
	DOCS_SECTION_CONFIG,
	DOCS_SECTION_ORDER,
	type DocsSectionId,
} from '@/content/docs';

export type DocsNavItem = {
	title: string;
	href: string;
	section: string;
	slug: string;
};

export type DocsNavSection = {
	id: string;
	title: string;
	items: DocsNavItem[];
};

export type DocsNav = {
	rootDir: string;
	sections: DocsNavSection[];
};

const itemsBySection = new Map<string, DocsNavItem[]>();

for (const entry of [...entries].sort(compareDocsEntries)) {
	const sectionId = entry.segments[0]!;
	const pageSlug = entry.segments[entry.segments.length - 1]!;
	const items = itemsBySection.get(sectionId) ?? [];

	items.push({
		title: entry.title,
		href: `${DOCS_ROOT}/${sectionId}/${pageSlug}`,
		section: sectionId,
		slug: pageSlug,
	});
	itemsBySection.set(sectionId, items);
}

export const docsNav: DocsNav = {
	rootDir: DOCS_ROOT,
	sections: DOCS_SECTION_ORDER.flatMap((sectionId) => {
		const items = itemsBySection.get(sectionId);
		if (!items || items.length === 0) {
			return [];
		}

		const config = DOCS_SECTION_CONFIG[sectionId as DocsSectionId];

		return [
			{
				id: sectionId,
				title: config.title,
				items,
			},
		];
	}),
};
