import type { DocsSiteContent } from '@/lib/docs-kit/content/docs-site-content.types';
import type { DocsManifest } from '@/lib/docs-kit/manifest/docs-manifest';

/** Projects configured content metadata into the runtime manifest shape. */
export function projectDocsManifest(content: DocsSiteContent): DocsManifest {
	return {
		rootDir: content.rootDir,
		sections: content.sections.map((section) => ({
			id: section.id,
			title: section.title,
			pages: section.pages.map((page) => ({
				section: section.id,
				slug: page.slug,
				title: page.title,
				description: page.description,
				llms: page.llms,
			})),
		})),
	};
}
