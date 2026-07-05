import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocsKit } from '@/docs-kit/config';
import type { DocsManifest, DocsManifestPage } from '@/docs-kit/manifest/docs-manifest';
import { contentPageKey, discoverContentFiles } from '@/docs-kit/manifest/discover-content-files';
import type { DocsManifestConfig } from '@/docs-kit/manifest/docs-manifest';

type PageMetaFile = {
	description?: string;
	llms?: boolean;
};

async function readPageMeta(contentRoot: string, section: string, slug: string): Promise<PageMetaFile | undefined> {
	const metaPath = join(contentRoot, section, `${slug}.meta.json`);

	try {
		const raw = await readFile(metaPath, 'utf8');
		return JSON.parse(raw) as PageMetaFile;
	} catch {
		return undefined;
	}
}

function resolveContentPath(contentRoot: string, section: string, slug: string): string {
	return join(contentRoot, section, `${slug}.mdx`);
}

async function assertNoOrphanContentFiles(contentRoot: string, manifestConfig: DocsManifestConfig): Promise<void> {
	const discovered = await discoverContentFiles(contentRoot);
	const manifestKeys = new Set(
		manifestConfig.sections.flatMap((section) =>
			section.pages.map((page) => contentPageKey(page.section, page.slug)),
		),
	);
	const orphans = discovered.filter((page) => !manifestKeys.has(contentPageKey(page.section, page.slug)));

	if (orphans.length > 0) {
		const listed = orphans.map((page) => contentPageKey(page.section, page.slug)).join(', ');
		throw new Error(`Content files are not listed in the docs manifest: ${listed}`);
	}
}

/**
 * Builds the validated docs manifest from the maintained config and content tree.
 */
export async function buildDocsManifest(manifestConfig?: DocsManifestConfig): Promise<DocsManifest> {
	const kit = getDocsKit();
	const config = manifestConfig ?? kit.manifest;
	const contentRoot = kit.contentRoot;
	const sections = [];

	if (!manifestConfig) {
		await assertNoOrphanContentFiles(contentRoot, config);
	}

	for (const section of config.sections) {
		const pages: DocsManifestPage[] = [];

		for (const page of section.pages) {
			const contentPath = resolveContentPath(contentRoot, page.section, page.slug);

			try {
				await readFile(contentPath, 'utf8');
			} catch {
				throw new Error(`Manifest entry has no content file: ${contentPath}`);
			}

			const meta = await readPageMeta(contentRoot, page.section, page.slug);
			pages.push({
				section: page.section,
				slug: page.slug,
				title: page.title,
				description: meta?.description,
				llms: meta?.llms,
			});
		}

		sections.push({
			id: section.id,
			title: section.title,
			pages,
		});
	}

	return {
		rootDir: config.rootDir,
		sections,
	};
}

export function getContentFilePath(section: string, slug: string): string {
	const { contentRoot } = getDocsKit();
	return resolveContentPath(contentRoot, section, slug);
}
