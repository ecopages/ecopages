import type { DocsSiteContent, DocsSiteContentMeta } from '@/lib/docs-kit/content/docs-site-content.types';
import type { DocsMdxComponent } from '@/lib/docs-kit/mdx/docs-mdx.types';

/** Joins site metadata with imported MDX modules for each configured page. */
export function attachDocsContentModules(
	meta: DocsSiteContentMeta,
	modules: Record<string, DocsMdxComponent>,
): DocsSiteContent {
	return {
		rootDir: meta.rootDir,
		sections: meta.sections.map((section) => ({
			...section,
			pages: section.pages.map((page) => {
				const key = `${section.id}/${page.slug}`;
				const content = modules[key];

				if (!content) {
					throw new Error(`Missing MDX module for docs page: ${key}`);
				}

				return { ...page, content };
			}),
		})),
	};
}
