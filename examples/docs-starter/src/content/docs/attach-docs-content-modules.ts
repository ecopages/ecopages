import type { DocsSiteContent, DocsSiteContentMeta } from '@/docs-kit/content/docs-site-content.types';
import type { DocsMdxComponent } from '@/docs-kit/mdx/docs-mdx.types';

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

/** Builds site content with stub modules for Node CLI scripts that must not import MDX. */
export function stubDocsSiteContent(meta: DocsSiteContentMeta): DocsSiteContent {
	const stub: DocsMdxComponent = () => null;

	return attachDocsContentModules(
		meta,
		Object.fromEntries(
			meta.sections.flatMap((section) => section.pages.map((page) => [`${section.id}/${page.slug}`, stub])),
		),
	);
}
