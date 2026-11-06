import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { DEV_ROBOTS, DEV_ROOT } from '@/content/dev';
import { DevBreadcrumb } from '@/components/dev-page';
import { devEntries } from '@/lib/dev-nav';
import { DevLayout } from '@/layouts/docs-layout';

export default eco.page<{}, JsxRenderable>({
	layout: DevLayout,
	metadata: () => ({
		title: 'Developers | Architecture',
		description: 'How Ecopages works inside: the build, the browser module graph, plugins, HMR and rendering.',
		url: DEV_ROOT,
		robots: DEV_ROBOTS,
	}),
	render: () => (
		<section class="docs-page">
			<div class="docs-bar unstyled">
				<DevBreadcrumb />
			</div>
			<h1>Architecture</h1>
			<p>
				These pages explain how Ecopages works inside, for people who change the framework. Building an app does
				not need them: start with the <a href="/docs/getting-started/introduction">documentation</a>.
			</p>
			<p>
				Each page lists the code it describes in its <code>sources</code>. A pull request that changes a file
				under those paths without touching the page fails the <code>Developer pages</code> check, so the pages
				move with the code.
			</p>
			<h2 id="pages">Pages</h2>
			<ul>
				{devEntries.map((entry) => (
					<li>
						<a href={`${DEV_ROOT}/${entry.slug}`}>{entry.title}</a>: {entry.description}
					</li>
				))}
			</ul>
		</section>
	),
});
