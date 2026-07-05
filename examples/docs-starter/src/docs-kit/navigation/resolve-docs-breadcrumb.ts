import type { BreadcrumbItem } from '@/components/breadcrumb/breadcrumb';
import type { DocsManifestConfig } from '../manifest/docs-manifest';

/**
 * Builds docs breadcrumb items from manifest metadata and the current page.
 */
export function resolveDocsBreadcrumb(config: DocsManifestConfig, section: string, slug: string): BreadcrumbItem[] {
	const manifestSection = config.sections.find((entry) => entry.id === section);
	const page = manifestSection?.pages.find((entry) => entry.slug === slug);

	if (!manifestSection || !page) {
		return [];
	}

	const firstPage = config.sections[0]?.pages[0];
	const docsIndexHref = firstPage ? `${config.rootDir}/${firstPage.section}/${firstPage.slug}` : config.rootDir;
	const firstSectionPage = manifestSection.pages[0];

	return [
		{ label: 'Docs', href: docsIndexHref },
		{
			label: manifestSection.title,
			href: firstSectionPage ? `${config.rootDir}/${section}/${firstSectionPage.slug}` : undefined,
		},
		{ label: page.title },
	];
}
