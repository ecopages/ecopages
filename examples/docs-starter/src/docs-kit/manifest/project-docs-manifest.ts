import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';
import type { DocsManifest } from '@/docs-kit/manifest/docs-manifest';

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
