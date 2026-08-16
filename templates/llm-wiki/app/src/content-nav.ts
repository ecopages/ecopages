import { entries as wikiEntries } from 'ecopages:content/wiki';
import {
	compareWikiEntries,
	formatCategoryTitle,
	getCategoryForEntry,
	getCategoryOrder,
	WIKI_ROOT,
} from '@/content/wiki';

export type WikiNavItem = {
	title: string;
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
	const sectionId = getCategoryForEntry(entry);
	const items = wikiItemsBySection.get(sectionId) ?? [];

	items.push({
		title: entry.title,
		href: `${WIKI_ROOT}/${entry.slug}`,
		section: sectionId,
		slug: entry.slug,
	});
	wikiItemsBySection.set(sectionId, items);
}

export const wikiNav: WikiNav = {
	rootDir: WIKI_ROOT,
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
