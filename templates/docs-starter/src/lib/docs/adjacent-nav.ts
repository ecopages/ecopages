export type AdjacentNavLink = {
	href: string;
	title: string;
};

export type AdjacentNav = {
	sections: Array<{ items: AdjacentNavLink[] }>;
};

/** Every page of a docs nav in sidebar order, the sequence previous and next links follow. */
export function flattenDocsNav<T extends AdjacentNavLink>(nav: { sections: Array<{ items: T[] }> }): T[] {
	return nav.sections.flatMap((section) => section.items);
}

/**
 * Finds the pages before and after `href` in sidebar order, or `null` when `href` is not in the nav.
 *
 * @remarks
 * Rendered on the server by `DocsPagination`. Every client navigation swaps the page region that holds it,
 * so the links follow the route without client code.
 */
export function findAdjacentNavItems<T extends AdjacentNavLink>(
	nav: { sections: Array<{ items: T[] }> },
	href: string,
): { prev: T | null; next: T | null } | null {
	const pages = flattenDocsNav(nav);
	const index = pages.findIndex((page) => page.href === href);
	if (index === -1) {
		return null;
	}

	return {
		prev: index > 0 ? pages[index - 1]! : null,
		next: index < pages.length - 1 ? pages[index + 1]! : null,
	};
}
