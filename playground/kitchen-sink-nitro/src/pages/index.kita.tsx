import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout/base-layout.kita';
import { liveAnnouncements, releaseNotes, showcasePatterns } from '@/data/demo-data';

const featureMatrix = [
	{
		title: 'Browser router',
		description: 'Client-side page transitions now run across the same file-system and explicit routes.',
		href: '/integration-matrix',
	},
	{
		title: 'Image processor',
		description: 'Responsive asset variants and layout modes are exercised against a real local source image.',
		href: '/images',
	},
	{
		title: 'Cross integration matrix',
		description: 'Kita, Lit, React, and MDX are nested through each other to cover mixed rendering boundaries.',
		href: '/integration-matrix',
	},
	{
		title: 'File-system routing',
		description: 'Pages, layouts, metadata, 404 handling, and static paths remain convention-driven.',
		href: '/catalog/semantic-html',
	},
	{
		title: 'Page middleware + locals',
		description: 'Request-scoped data flows into pages and layouts without adding bespoke plumbing.',
		href: '/patterns/middleware',
	},
	{
		title: 'Explicit routes',
		description: 'Register additional pages and request handlers directly from the app bootstrap.',
		href: '/explicit/team',
	},
	{
		title: 'ctx.render()',
		description: 'Imperative handlers can still reuse EcoPages views and layouts for server responses.',
		href: '/latest',
	},
	{
		title: 'JSON APIs + grouped handlers',
		description: 'Dedicated API endpoints coexist alongside pages and share the same middleware contracts.',
		href: '/api-lab',
	},
	{
		title: 'MDX content',
		description: 'Narrative documentation sits beside runtime pages while using the same shell and layout.',
		href: '/docs',
	},
	{
		title: 'Server-only filesystem props',
		description:
			'A React route reads the pages tree through a .server helper and ships only the serialized result to the browser.',
		href: '/react-server-files',
	},
	{
		title: 'Server-only metadata',
		description:
			'A second React route imports the filesystem directly in metadata so the server can compute the document title without shipping the dependency client-side.',
		href: '/react-server-metadata',
	},
];

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},
	layout: BaseLayout,
	metadata: () => ({
		title: 'Kitchen Sink',
		description:
			'A broad Ecopages showcase for routing, images, mixed integrations, explicit routes, middleware, locals, and grouped APIs.',
		url: '/',
	}),
	render: () => {
		return (
			<div class="space-y-10">
				<section class="grid gap-6 rounded-md border border-border bg-background/90 p-8 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:grid-cols-[1.3fr_0.7fr]">
					<div class="space-y-5">
						<p class="text-sm font-semibold uppercase tracking-[0.28em] text-sky-600">Kitchen sink app</p>
						<h2 class="font-display text-4xl font-semibold tracking-tight lg:text-5xl">
							One playground that exercises the runtime instead of just proving it boots.
						</h2>
						<p class="max-w-2xl text-lg leading-8 text-muted">
							This kitchen sink now mixes file-system pages, browser-router navigation, image processing,
							cross-integration rendering, explicit routes, request middleware, locals, grouped handlers,
							and imperative rendering.
						</p>
						<div class="flex flex-wrap gap-3">
							<a href="/integration-matrix" class="button button--primary">
								Open the matrix
							</a>
							<a href="/images" class="button button--secondary">
								Inspect images
							</a>
						</div>
					</div>
					<div class="card card--accent p-5">
						<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Runtime snapshot</p>
						<ul class="mt-4 space-y-3 text-sm text-on-background-accent">
							<li>{showcasePatterns.length} catalog entries with static paths and metadata.</li>
							<li>{releaseNotes.length} release notes powering an explicit ctx.render() route.</li>
							<li>{liveAnnouncements.length} mutable announcements served by the admin API group.</li>
							<li>Browser-router navigation runs across the shared kitchen-sink shell.</li>
							<li>
								Image processing and mixed Kita, Lit, React, and MDX composition are covered by
								dedicated routes.
							</li>
						</ul>
					</div>
				</section>

				<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{featureMatrix.map((feature) => (
						<a href={feature.href} class="card card--hoverable group">
							<p class="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Use case</p>
							<h3 class="mt-3 font-display text-2xl font-semibold tracking-tight">{feature.title}</h3>
							<p class="mt-2 text-sm leading-7 text-muted">{feature.description}</p>
							<p class="mt-4 text-sm font-semibold text-on-background transition group-hover:text-sky-600">
								Open route
							</p>
						</a>
					))}
				</section>

				<section class="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
					<div class="card p-6">
						<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">What to click</p>
						<div class="mt-4 space-y-4 text-sm leading-7 text-muted">
							<p>
								Open{' '}
								<a class="text-sky-600 underline underline-offset-2" href="/integration-matrix">
									/integration-matrix
								</a>{' '}
								and then hop to the Lit and React entries to verify browser-router transitions while
								each integration renders the others.
							</p>
							<p>
								Visit{' '}
								<a class="text-sky-600 underline underline-offset-2" href="/images">
									/images
								</a>{' '}
								to inspect image-processor variants, constrained layouts, and a view-transition-ready
								asset.
							</p>
							<p>
								Visit{' '}
								<a
									class="text-sky-600 underline underline-offset-2"
									href="/patterns/middleware?flag=locals&flag=dynamic"
								>
									/patterns/middleware?flag=locals&flag=dynamic
								</a>{' '}
								to watch request locals flow into the page and layout.
							</p>
							<p>
								Open{' '}
								<a class="text-sky-600 underline underline-offset-2" href="/latest">
									/latest
								</a>{' '}
								to see an imperative handler call <span class="font-mono">ctx.render()</span> with a
								normal EcoPages view.
							</p>
							<p>
								Open{' '}
								<a class="text-sky-600 underline underline-offset-2" href="/react-server-files">
									/react-server-files
								</a>{' '}
								to inspect a page tree built by a <span class="font-mono">.server.ts</span> helper using{' '}
								<span class="font-mono">@ecopages/file-system</span> without shipping that helper to the
								browser.
							</p>
							<p>
								Open{' '}
								<a class="text-sky-600 underline underline-offset-2" href="/react-server-metadata">
									/react-server-metadata
								</a>{' '}
								to inspect a second server-only pattern where page{' '}
								<span class="font-mono">metadata</span> reads the filesystem directly while the browser
								entry stays clean.
							</p>
							<p>
								Send a POST to <span class="font-mono">/api/v1/admin/announcements</span> with the{' '}
								<span class="font-mono">x-kitchen-role: admin</span> header to exercise the grouped
								handler middleware chain.
							</p>
						</div>
					</div>
					<div class="card p-6">
						<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">
							Static catalog entries
						</p>
						<div class="mt-4 grid gap-4 md:grid-cols-2">
							{showcasePatterns.map((pattern) => (
								<a href={`/catalog/${pattern.slug}`} class="card card--accent">
									<p class="text-xs uppercase tracking-[0.24em] text-muted">{pattern.stage}</p>
									<h3 class="mt-2 font-display text-2xl font-semibold tracking-tight text-on-background-accent">
										{pattern.title}
									</h3>
									<p class="mt-2 text-sm leading-6 text-muted">{pattern.summary}</p>
								</a>
							))}
						</div>
					</div>
				</section>
			</div>
		);
	},
});
