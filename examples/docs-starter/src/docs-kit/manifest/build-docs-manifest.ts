import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocsKit } from '@/docs-kit/config';
import type { DocsSiteContent } from '@/docs-kit/content/docs-site-content.types';
import type { DocsManifest, DocsManifestPage } from '@/docs-kit/manifest/docs-manifest';
import { contentPageKey, discoverContentFiles } from '@/docs-kit/manifest/discover-content-files';
import { projectDocsManifest } from '@/docs-kit/manifest/project-docs-manifest';

function resolveContentPath(contentRoot: string, section: string, slug: string): string {
	return join(contentRoot, section, `${slug}.mdx`);
}

function collectConfiguredPageKeys(content: DocsSiteContent): Set<string> {
	return new Set(
		content.sections.flatMap((section) => section.pages.map((page) => contentPageKey(section.id, page.slug))),
	);
}

async function assertNoOrphanContentFiles(contentRoot: string, content: DocsSiteContent): Promise<void> {
	const discovered = await discoverContentFiles(contentRoot);
	const configuredKeys = collectConfiguredPageKeys(content);
	const orphans = discovered.filter((page) => !configuredKeys.has(contentPageKey(page.section, page.slug)));

	if (orphans.length > 0) {
		const listed = orphans.map((page) => contentPageKey(page.section, page.slug)).join(', ');
		throw new Error(`Content files are not listed in docs site content: ${listed}`);
	}
}

/** Builds the validated docs manifest from the site content tree. */
export async function buildDocsManifest(contentOverride?: DocsSiteContent): Promise<DocsManifest> {
	const kit = getDocsKit();
	const content = contentOverride ?? kit.content;
	const contentRoot = kit.contentRoot;
	const projected = projectDocsManifest(content);
	const sections = [];

	if (!contentOverride) {
		await assertNoOrphanContentFiles(contentRoot, content);
	}

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
