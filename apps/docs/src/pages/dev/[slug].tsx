import { eco } from '@ecopages/core';
import type { GetMetadata, GetStaticProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { getComponent, getEntryDependencies } from 'ecopages:content/dev/server';
import { DEV_ROBOTS, DEV_ROOT, type DevContentEntry } from '@/content/dev';
import { DevBreadcrumb, DevSources } from '@/components/dev-page';
import { devEntries } from '@/lib/dev-nav';
import { DevLayout } from '@/layouts/docs-layout';

type DevPageProps = {
	entry: DevContentEntry;
};

const getMetadata: GetMetadata<DevPageProps> = ({ props: { entry } }) => ({
	title: `Developers | ${entry.title}`,
	description: entry.description,
	url: `${DEV_ROOT}/${entry.slug}`,
	robots: DEV_ROBOTS,
});

const staticProps: GetStaticProps<DevPageProps> = async ({ pathname }) => {
	const slug = pathname.params.slug;
	const entry = devEntries.find((candidate) => candidate.slug === slug);

	if (!entry) {
		throw HttpError.NotFound(`Unknown developer page: ${String(slug)}`);
	}

	return { props: { entry } };
};

export default eco.page<DevPageProps, JsxRenderable>({
	layout: DevLayout,
	staticPaths: async () => ({
		paths: devEntries.map((entry) => ({ params: { slug: entry.slug } })),
	}),
	staticProps,
	metadata: getMetadata,
	dependencies: ({ props }) => getEntryDependencies(props.entry.slug),
	render: async ({ entry }) => {
		const Content = await getComponent(entry.slug);

		return (
			<section class="docs-page">
				<div class="docs-bar unstyled">
					<DevBreadcrumb title={entry.title} />
				</div>
				{await Content({})}
				<DevSources sources={entry.sources} />
			</section>
		);
	},
});
