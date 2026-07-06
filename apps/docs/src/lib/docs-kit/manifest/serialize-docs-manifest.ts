import type { DocsManifest } from '@/lib/docs-kit/manifest/docs-manifest';

export type DocsManifestNavPage = {
	href: string;
	title: string;
	section: string;
	slug: string;
};

export function flattenManifestPages(manifest: DocsManifest): DocsManifestNavPage[] {
	return manifest.sections.flatMap((section) =>
		section.pages.map((page) => ({
			href: `${manifest.rootDir}/${page.section}/${page.slug}`,
			title: page.title,
			section: page.section,
			slug: page.slug,
		})),
	);
}

export function serializeDocsManifestData(manifest: DocsManifest): string {
	return JSON.stringify({
		rootDir: manifest.rootDir,
		sections: manifest.sections.map((section) => ({
			id: section.id,
			title: section.title,
			pages: section.pages.map((page) => ({
				href: `${manifest.rootDir}/${page.section}/${page.slug}`,
				title: page.title,
				section: page.section,
				slug: page.slug,
			})),
		})),
		pages: flattenManifestPages(manifest),
	});
}
