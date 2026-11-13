import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
import type { DocsContentEntry } from '@/content/docs';
import { parseDocsCatchAllSegments, resolveFromCatchAll } from '@/lib/docs/resolve-from-catch-all';
import { DocsLayout } from '@/layouts/docs-layout';

type DocsCatchAllProps = {
	entry: DocsContentEntry;
};

/**
 * @remarks Fallback `ecopages:content/*` types use untyped frontmatter until collection generate runs.
 */
function asDocsContentEntry(entry: (typeof entries)[number]): DocsContentEntry {
	return entry as DocsContentEntry;
}

const getMetadata: GetMetadata<DocsCatchAllProps> = ({ props: { entry } }) => ({
	title: `Docs | ${entry.title}`,
	description: entry.description ?? '',
	url: `/docs/${entry.slug}`,
});

const staticProps: GetStaticProps<DocsCatchAllProps> = async ({ pathname }) => {
	const segments = parseDocsCatchAllSegments(pathname.params.slug);
	const slug = segments.join('/');
	const found = entries.find((candidate) => candidate.slug === slug);

	if (!found) {
		throw HttpError.NotFound(`Unknown docs entry: ${slug}`);
	}

	return {
		props: {
			entry: asDocsContentEntry(found),
		},
	};
};

export default eco.page<DocsCatchAllProps, JsxRenderable>({
	layout: {
		component: DocsLayout,
		props: ({ params }) => resolveFromCatchAll(params?.slug),
	},
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
		const Content = await getComponent(entry.slug);

		return <section class="docs-page">{await Content({})}</section>;
	},
});
