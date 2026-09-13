import { entries as wikiEntries } from 'ecopages:content/wiki';
import {
	compareWikiEntries,
	formatCategoryTitle,
	getCategoryForEntry,
	getCategoryOrder,
	type WikiContentEntry,
	WIKI_ROOT,
} from '@/content/wiki';

const CATALOG_HREF = '/';

export type WikiNavItem = {
	title: string;
	summary: string;
	href: string;
	section: string;
	slug: string;
};

export type WikiNavSection = {
	id: string;
	title: string;
	items: WikiNavItem[];
};

export type WikiNav = {
	rootDir: string;
	sections: WikiNavSection[];
};

const wikiItemsBySection = new Map<string, WikiNavItem[]>();

for (const entry of [...wikiEntries].sort(compareWikiEntries)) {
	const wikiEntry = entry as WikiContentEntry;
	const sectionId = getCategoryForEntry(wikiEntry);
	const items = wikiItemsBySection.get(sectionId) ?? [];

	items.push({
		title: wikiEntry.title,
		summary: wikiEntry.summary,
		href: `${WIKI_ROOT}/${wikiEntry.slug}`,
		section: sectionId,
		slug: wikiEntry.slug,
	});
	wikiItemsBySection.set(sectionId, items);
}

export const wikiNav: WikiNav = {
	rootDir: CATALOG_HREF,
	sections: (() => {
		const orderFromSpec = getCategoryOrder();
		if (orderFromSpec.length > 0) {
			return orderFromSpec.flatMap((category) => {
				const items = wikiItemsBySection.get(category);
				if (!items || items.length === 0) {
					return [];
				}

				return [
					{
						id: category,
						title: formatCategoryTitle(category),
						items,
					},
				];
			});
		}

		return [...wikiItemsBySection.entries()].map(([category, items]) => ({
			id: category,
			title: formatCategoryTitle(category),
			items,
		}));
	})(),
};
