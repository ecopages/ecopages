import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries, getComponent, getEntryBySegments } from 'ecopages:content/docs';
import { getDocsMdxComponents } from '@/docs-kit/mdx-components';
import { resolveFromCatchAll } from '@/docs-kit/resolve-from-catch-all';
import { DocsLayout } from '@/layouts/docs-layout';

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
	const entry = getEntryBySegments([resolved.section, resolved.slug]);

	return {
		props: {
			section: resolved.section,
			slug: resolved.slug,
			title: entry.title,
			description: entry.description,
		},
	};
};

export default eco.page<DocsCatchAllProps, JsxRenderable>({
	layout: DocsLayout,
	staticPaths: async () => ({
		paths: entries.map((entry) => ({
			params: {
				slug: entry.segments,
			},
		})),
	}),
	staticProps,
	metadata: getMetadata,
	render: async ({ section, slug }) => {
		const Content = getComponent(`${section}/${slug}`);

		return await Content({ components: getDocsMdxComponents() });
	},
});
