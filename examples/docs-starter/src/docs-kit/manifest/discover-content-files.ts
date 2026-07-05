import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type DiscoveredContentPage = {
	section: string;
	slug: string;
};

/**
 * Walks `contentRoot` and returns every `section/slug` pair for `.mdx` files.
 */
export async function discoverContentFiles(contentRoot: string): Promise<DiscoveredContentPage[]> {
	const sections = await readdir(contentRoot, { withFileTypes: true });
	const pages: DiscoveredContentPage[] = [];

	for (const sectionEntry of sections) {
		if (!sectionEntry.isDirectory()) {
			continue;
		}

		const sectionDir = join(contentRoot, sectionEntry.name);
		const files = await readdir(sectionDir, { withFileTypes: true });

		for (const fileEntry of files) {
			if (!fileEntry.isFile() || !fileEntry.name.endsWith('.mdx')) {
				continue;
			}

			pages.push({
				section: sectionEntry.name,
				slug: fileEntry.name.replace(/\.mdx$/, ''),
			});
		}
	}

	return pages;
}

export function contentPageKey(section: string, slug: string): string {
	return `${section}/${slug}`;
}
