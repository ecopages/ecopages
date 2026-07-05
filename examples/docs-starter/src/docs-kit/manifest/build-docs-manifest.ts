import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DocsManifest, DocsManifestPage } from './docs-manifest';
import { docsManifestConfig } from './docs-manifest.config';

const contentRoot = join(process.cwd(), 'src/content/docs');

function resolveContentPath(section: string, slug: string): string {
	return join(contentRoot, section, `${slug}.mdx`);
}

export async function buildDocsManifest(): Promise<DocsManifest> {
	const sections = [];

	for (const section of docsManifestConfig.sections) {
		const pages: DocsManifestPage[] = [];

		for (const page of section.pages) {
			const contentPath = resolveContentPath(page.section, page.slug);
			await readFile(contentPath, 'utf8');
			pages.push({
				section: page.section,
				slug: page.slug,
				title: page.title,
			});
		}

		sections.push({
			id: section.id,
			title: section.title,
			pages,
		});
	}

	return {
		rootDir: docsManifestConfig.rootDir,
		sections,
	};
}

export function getContentFilePath(section: string, slug: string): string {
	return resolveContentPath(section, slug);
}
