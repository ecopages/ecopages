import type { DocsManifest, DocsManifestConfig } from '@/lib/docs-kit/manifest/docs-manifest';

export type DocsManifestNavPage = {
	href: string;
	title: string;
	section: string;
	slug: string;
};

type ManifestNavSource = Pick<DocsManifest, 'rootDir' | 'sections'> | DocsManifestConfig;

export function flattenManifestPages(manifest: ManifestNavSource): DocsManifestNavPage[] {
	return manifest.sections.flatMap((section) =>
		section.pages.map((page) => ({
			href: `${manifest.rootDir}/${page.section}/${page.slug}`,
			title: page.title,
			section: page.section,
			slug: page.slug,
		})),
	);
}

export function serializeDocsManifestData(manifest: ManifestNavSource): string {
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
