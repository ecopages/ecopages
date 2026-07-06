import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import '@/docs-kit.instance';
import { getDocsContent } from '@/lib/docs-kit/content/get-docs-content';
import { resolveDocsPage } from '@/lib/docs-kit/content/resolve-docs-page';
import { getDocsMdxComponents } from '@/lib/docs-kit/mdx/docs-mdx-components';
import { DocsLayout } from '@/lib/docs-kit/layout';
import { getDocsManifest } from '@/lib/docs-kit/manifest/get-docs-manifest';
import { resolveFromCatchAll } from '@/lib/docs-kit/navigation/resolve-from-catch-all';

type DocsCatchAllProps = {
	section: string;
	slug: string;
	title: string;
	description?: string;
};

export const getMetadata: GetMetadata<DocsCatchAllProps> = ({ props: { title, description } }) => ({
	title: `Docs | ${title}`,
	description: description ?? '',
});

const staticProps: GetStaticProps<DocsCatchAllProps> = async ({ pathname }) => {
	const resolved = resolveFromCatchAll(pathname.params.slug);
	const page = resolveDocsPage(resolved.section, resolved.slug);

	return {
		props: {
			section: page.section,
			slug: page.slug,
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
	render: async ({ section, slug }) => {
		const Content = getDocsContent(section, slug);

		return await Content({ components: getDocsMdxComponents() });
	},
});
