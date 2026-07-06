import type { BreadcrumbItem } from '../components/breadcrumb/breadcrumb';
import type { DocsSiteContent } from '../content/docs-site-content.types';

export function resolveDocsBreadcrumb(content: DocsSiteContent, section: string, slug: string): BreadcrumbItem[] {
	const contentSection = content.sections.find((entry) => entry.id === section);
	const page = contentSection?.pages.find((entry) => entry.slug === slug);

	if (!contentSection || !page) {
		return [];
	}

	const firstSection = content.sections[0];
	const firstPage = firstSection?.pages[0];
	const docsIndexHref =
		firstSection && firstPage ? `${content.rootDir}/${firstSection.id}/${firstPage.slug}` : content.rootDir;
	const firstSectionPage = contentSection.pages[0];

	return [
		{ label: 'Docs', href: docsIndexHref },
		{
			label: contentSection.title,
			href: firstSectionPage ? `${content.rootDir}/${section}/${firstSectionPage.slug}` : undefined,
		},
		{ label: page.title },
	];
}
