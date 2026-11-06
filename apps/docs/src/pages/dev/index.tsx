import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { getComponent, getEntryDependencies } from 'ecopages:content/dev/server';
import { DEV_INDEX_SLUG, DEV_ROBOTS, DEV_ROOT } from '@/content/dev';
import { DevBreadcrumb, DevSources } from '@/components/dev-page';
import { devEntries } from '@/lib/dev-nav';
import { DevLayout } from '@/layouts/docs-layout';

const overview = devEntries.find((entry) => entry.slug === DEV_INDEX_SLUG)!;

export default eco.page<{}, JsxRenderable>({
	layout: DevLayout,
	metadata: () => ({
		title: `Developers | ${overview.title}`,
		description: overview.description,
		url: DEV_ROOT,
		robots: DEV_ROBOTS,
	}),
	dependencies: () => getEntryDependencies(DEV_INDEX_SLUG),
	render: async () => {
		const Content = await getComponent(DEV_INDEX_SLUG);

		return (
			<section class="docs-page">
				<div class="docs-bar unstyled">
					<DevBreadcrumb />
				</div>
				{await Content({})}
				<DevSources sources={overview.sources} />
			</section>
		);
	},
});
