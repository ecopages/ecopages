import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
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
	const slug = segments.join('/');
	const entry = entries.find((candidate) => candidate.slug === slug);

	if (!entry) {
		throw HttpError.NotFound(`Unknown docs entry: ${slug}`);
	}

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
	dependencies: async ({ props }) => getEntryDependencies(`${props.section}/${props.slug}`),
	render: async ({ section, slug }) => {
		const Content = await getComponent(`${section}/${slug}`);

		return await Content();
	},
});
