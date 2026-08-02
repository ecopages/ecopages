import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import {
	RuiBreadcrumb,
	RuiBreadcrumbItem,
	RuiBreadcrumbLink,
	RuiBreadcrumbList,
	RuiBreadcrumbPage,
	RuiBreadcrumbSeparator,
} from '@ecopages/radiant-ui/breadcrumb';
import { entries } from 'ecopages:content/docs';
import { getComponent, getEntryDependencies } from 'ecopages:content/docs/server';
import type { Entry } from 'ecopages:content/docs';
import { CopyForLlm } from '@/components/copy-for-llm';
import { docsNav } from '@/lib/content-nav';
import { getDocsLlmUrl } from '@/lib/docs/docs-llm-url';
import { parseDocsCatchAllSegments } from '@/lib/docs/resolve-from-catch-all';
import { DocsLayout } from '@/layouts/docs-layout';

type DocsCatchAllProps = {
	entry: Entry;
};

const DocsBreadcrumb = ({ entry }: { entry: Entry }) => {
	const section = docsNav.sections.find((navSection) => navSection.id === entry.segments[0]);
	const sectionLink = section?.items[0];
	const docsIndexLink = docsNav.sections[0]?.items[0];

	return (
		<div class="unstyled">
			<RuiBreadcrumb label="Page location">
				<RuiBreadcrumbList>
					<RuiBreadcrumbItem>
						<RuiBreadcrumbLink href="/">Home</RuiBreadcrumbLink>
					</RuiBreadcrumbItem>
					<RuiBreadcrumbSeparator />
					<RuiBreadcrumbItem>
						<RuiBreadcrumbLink href={docsIndexLink?.href ?? '/docs'}>Docs</RuiBreadcrumbLink>
					</RuiBreadcrumbItem>
					{section && sectionLink ? (
						<>
							<RuiBreadcrumbSeparator />
							<RuiBreadcrumbItem>
								<RuiBreadcrumbLink href={sectionLink.href}>{section.title}</RuiBreadcrumbLink>
							</RuiBreadcrumbItem>
						</>
					) : null}
					<RuiBreadcrumbSeparator />
					<RuiBreadcrumbItem>
						<RuiBreadcrumbPage>{entry.title}</RuiBreadcrumbPage>
					</RuiBreadcrumbItem>
				</RuiBreadcrumbList>
			</RuiBreadcrumb>
		</div>
	);
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
	dependencies: async ({ props }) => {
		const entryDependencies = await getEntryDependencies(props.entry.slug);

		return {
			...entryDependencies,
			components: [...(entryDependencies?.components ?? []), CopyForLlm],
		};
	},
	render: async ({ entry }) => {
		const Content = await getComponent(entry.slug);
		const section = entry.segments[0];
		const slug = entry.segments.at(-1);
		const llmUrl = section && slug ? getDocsLlmUrl(section, slug) : undefined;

		return (
			<section class="docs-page">
				<div class="docs-page__header">
					<DocsBreadcrumb entry={entry} />
					{llmUrl ? <CopyForLlm llmUrl={llmUrl} /> : null}
				</div>
				{await Content()}
			</section>
		);
	},
});
