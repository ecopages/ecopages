import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocsKit } from '@/lib/docs-kit/config';
import type { DocsSiteContent } from '@/lib/docs-kit/content/docs-site-content.types';
import type { DocsManifest, DocsManifestPage } from '@/lib/docs-kit/manifest/docs-manifest';
import { projectDocsManifest } from '@/lib/docs-kit/manifest/project-docs-manifest';

function resolveContentPath(contentRoot: string, section: string, slug: string): string {
	return join(contentRoot, section, `${slug}.mdx`);
}

/**
 * Builds the validated docs manifest from the site content tree.
 */
export async function buildDocsManifest(contentOverride?: DocsSiteContent): Promise<DocsManifest> {
	const kit = getDocsKit();
	const content = contentOverride ?? kit.content;
	const contentRoot = kit.contentRoot;
	const projected = projectDocsManifest(content);
	const sections = [];

	for (const section of projected.sections) {
		const pages: DocsManifestPage[] = [];

		for (const page of section.pages) {
			const contentPath = resolveContentPath(contentRoot, page.section, page.slug);

			try {
				await readFile(contentPath, 'utf8');
			} catch {
				throw new Error(`Docs content entry has no MDX file: ${contentPath}`);
			}

			pages.push({
				section: page.section,
				slug: page.slug,
				title: page.title,
				description: page.description,
				llms: page.llms,
			});
		}

		sections.push({
			id: section.id,
			title: section.title,
			pages,
		});
	}

	return {
		rootDir: projected.rootDir,
		sections,
	};
}

export function getContentFilePath(section: string, slug: string): string {
	const { contentRoot } = getDocsKit();
	return resolveContentPath(contentRoot, section, slug);
}
