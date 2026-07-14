import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries, getEntryBySegments } from 'ecopages:content/docs';
import { getComponent } from 'ecopages:content/docs/server';
import { docsMdxComponents } from '@/lib/docs/mdx-components';
import { parseDocsCatchAllSegments } from '@/lib/docs/resolve-from-catch-all';
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
	const segments = parseDocsCatchAllSegments(pathname.params.slug);
	const entry = getEntryBySegments(segments);

	return {
		props: {
			section: entry.segments[0]!,
			slug: entry.segments[entry.segments.length - 1]!,
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

		return await Content({ components: docsMdxComponents });
	},
});
