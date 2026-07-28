import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
import type { Entry } from 'ecopages:content/docs';
import { docsMdxComponents } from '@/lib/docs/mdx-components';
import { parseDocsCatchAllSegments } from '@/lib/docs/resolve-from-catch-all';
import { DocsLayout } from '@/layouts/docs-layout';

type DocsCatchAllProps = {
	entry: Entry;
};

export const getMetadata: GetMetadata<DocsCatchAllProps> = ({ props: { entry } }) => ({
	title: `Docs | ${entry.title}`,
	description: entry.description ?? '',
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
			entry,
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
	dependencies: ({ props }) => getEntryDependencies(props.entry.slug),
	render: async ({ entry }) => {
		const Content = getComponent(entry.slug);

		return await Content({ components: docsMdxComponents });
	},
});
