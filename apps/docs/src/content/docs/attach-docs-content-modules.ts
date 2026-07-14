import { getComponent } from 'ecopages:content/docs';
import type { DocsSiteContent, DocsSiteContentMeta } from '@/lib/docs-kit/content/docs-site-content.types';

/** Joins site metadata with MDX modules from the content processor collection. */
export function attachDocsContentModules(meta: DocsSiteContentMeta): DocsSiteContent {
	return {
		rootDir: meta.rootDir,
		sections: meta.sections.map((section) => ({
			...section,
			pages: section.pages.map((page) => {
				const slug = `${section.id}/${page.slug}`;

				return {
					...page,
					content: getComponent(slug),
				};
			}),
		})),
	};
}
