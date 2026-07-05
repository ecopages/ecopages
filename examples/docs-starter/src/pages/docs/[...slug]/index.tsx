import { readFile } from 'node:fs/promises';
import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import '@/docs-kit.instance';
import { compileDocsMdx } from '@/docs-kit/compile/compile-mdx';
import { resolveFromCatchAll } from '@/docs-kit/compile/resolve-from-catch-all';
import { getContentFilePath } from '@/docs-kit/manifest/build-docs-manifest';
import { getDocsManifest } from '@/docs-kit/manifest/get-docs-manifest';
import type { DocsManifestPage } from '@/docs-kit/manifest/docs-manifest';
import { DocsLayout } from '@/docs-kit/layout';

type DocsCatchAllProps = {
	source: string;
	section: string;
	slug: string;
	title: string;
	description?: string;
};

async function findManifestPage(section: string, slug: string): Promise<DocsManifestPage> {
	const manifest = await getDocsManifest();
	const page = manifest.sections
		.flatMap((entry) => entry.pages)
		.find((entry) => entry.section === section && entry.slug === slug);

	if (!page) {
		throw new Error(`Unknown docs page: ${section}/${slug}`);
	}

	return page;
}

export const getMetadata: GetMetadata<DocsCatchAllProps> = ({ props: { title, description } }) => ({
	title: `Docs | ${title}`,
	description: description ?? '',
});

const staticProps: GetStaticProps<DocsCatchAllProps> = async ({ pathname }) => {
	const resolved = resolveFromCatchAll(pathname.params.slug);
	const page = await findManifestPage(resolved.section, resolved.slug);
	const filePath = getContentFilePath(resolved.section, resolved.slug);
	const source = await readFile(filePath, 'utf8');

	return {
		props: {
			source,
			section: resolved.section,
			slug: resolved.slug,
			title: page.title,
			description: page.description,
		},
	};
};

export default eco.page<DocsCatchAllProps, JsxRenderable>({
	layout: DocsLayout,
	staticPaths: async () => {
		const manifest = await getDocsManifest();

		return {
			paths: manifest.sections.flatMap((section) =>
				section.pages.map((page) => ({
					params: {
						slug: [page.section, page.slug],
					},
				})),
			),
		};
	},
	staticProps,
	metadata: getMetadata,
	render: async ({ source, section, slug }) => {
		const filePath = getContentFilePath(section, slug);
		const compiled = await compileDocsMdx({ source, filePath });
		const content = await compiled.default({});

		return content;
	},
});
