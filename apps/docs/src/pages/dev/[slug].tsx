import { eco } from '@ecopages/core';
import type { GetMetadata, GetProps } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import type { JsxRenderable } from '@ecopages/jsx';
import { getComponent, getEntryDependencies } from 'ecopages:content/dev/server';
import { DEV_INDEX_SLUG, DEV_ROBOTS, DEV_ROOT, devEntryHref, type DevContentEntry } from '@/content/dev';
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

const getProps: GetProps<DevPageProps> = async ({ pathname }) => {
	const slug = pathname.params.slug;
	const entry = devEntries.find((candidate) => candidate.slug === slug && candidate.slug !== DEV_INDEX_SLUG);

	if (!entry) {
		throw HttpError.NotFound(`Unknown developer page: ${String(slug)}`);
	}

	return { entry };
};

export default eco.page<DevPageProps, JsxRenderable>({
	layout: {
		component: DevLayout,
		props: ({ params }) => ({ currentHref: devEntryHref(String(params?.slug)) }),
	},
	paths: async () =>
		devEntries.filter((entry) => entry.slug !== DEV_INDEX_SLUG).map((entry) => ({ params: { slug: entry.slug } })),
	props: getProps,
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
