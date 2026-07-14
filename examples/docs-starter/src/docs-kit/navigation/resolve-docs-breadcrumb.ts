import type { BreadcrumbItem } from '../components/breadcrumb/breadcrumb';
import type { DocsNav } from '@/content-nav';

export function resolveDocsBreadcrumb(nav: DocsNav, section: string, slug: string): BreadcrumbItem[] {
	const contentSection = nav.sections.find((entry) => entry.id === section);
	const page = contentSection?.items.find((entry) => entry.slug === slug);

	if (!contentSection || !page) {
		return [];
	}

	const firstSection = nav.sections[0];
	const firstPage = firstSection?.items[0];
	const docsIndexHref =
		firstSection && firstPage ? `${nav.rootDir}/${firstSection.id}/${firstPage.slug}` : nav.rootDir;
	const firstSectionPage = contentSection.items[0];

	return [
		{ label: 'Docs', href: docsIndexHref },
		{
			label: contentSection.title,
			href: firstSectionPage ? `${nav.rootDir}/${section}/${firstSectionPage.slug}` : undefined,
		},
		{ label: page.title },
	];
}
