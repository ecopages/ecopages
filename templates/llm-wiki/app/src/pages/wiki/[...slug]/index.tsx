import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps, PageParams } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { entries } from 'ecopages:content/wiki';
import { getComponent, getEntryDependencies } from 'ecopages:content/wiki/server';
import { getCategoryForEntry, type WikiContentEntry } from '@/content/wiki';
import { wikiNav } from '@/content-nav';
import { parseWikiCatchAllSegments } from '@/lib/wiki/catch-all';
import { DocsLayout } from '@/layouts/docs-layout';

type WikiCatchAllProps = {
	section: string;
	slug: string;
	title: string;
	nav: typeof wikiNav;
	rootLabel: string;
	sources: string[];
};

function wikiPageFromCatchAll(slugParam: PageParams[string] | undefined): WikiCatchAllProps {
	const segments = parseWikiCatchAllSegments(slugParam);
	const slug = segments.join('/');
	const entry = entries.find((candidate) => candidate.slug === slug);

	if (!entry) {
		throw HttpError.NotFound(`Unknown wiki entry: ${slug}`);
	}

	const wikiEntry = entry as WikiContentEntry;

	return {
		section: getCategoryForEntry(wikiEntry),
		slug: wikiEntry.slug,
		title: wikiEntry.title,
		nav: wikiNav,
		rootLabel: 'Wiki',
		sources: wikiEntry.sources ?? [],
	};
}

export const getMetadata: GetMetadata<WikiCatchAllProps> = ({ props: { title, slug } }) => ({
	title: `Wiki | ${title}`,
	description: `Wiki page for ${title}`,
	url: `wiki/${slug}`,
});

const staticProps: GetStaticProps<WikiCatchAllProps> = async ({ pathname }) => ({
	props: wikiPageFromCatchAll(pathname.params.slug),
});

export default eco.page<WikiCatchAllProps, JsxRenderable>({
	layout: {
		component: DocsLayout,
		props: ({ params }) => wikiPageFromCatchAll(params?.slug),
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
	dependencies: async ({ props }) => getEntryDependencies(props.slug),
	render: async ({ slug }) => {
		const Content = await getComponent(slug);

		return await Content({});
	},
});
