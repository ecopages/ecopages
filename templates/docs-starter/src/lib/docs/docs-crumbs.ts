export type DocsCrumb = {
	label: string;
	href?: string;
};

type CrumbNav = {
	sections: Array<{
		id: string;
		title: string;
		items: Array<{ slug: string; title: string; href: string }>;
	}>;
};

/**
 * Builds the breadcrumb trail for a docs page: an optional Home crumb, Docs, the section and the page.
 *
 * @remarks
 * The Docs and section links point at the first page of the docs set and of the section, so they follow the
 * nav instead of a hardcoded path. Returns an empty trail for a page that is not in the nav.
 */
export function buildDocsCrumbs(
	nav: CrumbNav,
	section: string | undefined,
	slug: string | undefined,
	options: { home?: DocsCrumb } = {},
): DocsCrumb[] {
	const contentSection = nav.sections.find((entry) => entry.id === section);
	const page = contentSection?.items.find((entry) => entry.slug === slug);
	if (!contentSection || !page) {
		return [];
	}

	return [
		...(options.home ? [options.home] : []),
		{ label: 'Docs', href: nav.sections[0]?.items[0]?.href },
		{ label: contentSection.title, href: contentSection.items[0]?.href },
		{ label: page.title },
	];
}
