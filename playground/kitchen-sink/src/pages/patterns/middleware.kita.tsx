import { eco } from '@ecopages/core';
import { requestInfoBaseLayout } from '@/layouts/base-layout';
import { requestInfoMiddleware } from '@/handlers/demo-middleware';
import { getPageTestId } from '@/data/primary-links';

export default eco.page({
	dependencies: {
		stylesheets: ['./middleware.css'],
	},
	layout: requestInfoBaseLayout,
	cache: 'dynamic',
	middleware: [requestInfoMiddleware],
	metadata: () => ({
		title: 'Middleware locals',
		description:
			"Request middleware populates locals that the page's props hook reads and a layout props factory hands to the layout.",
	}),
	props: ({ locals }) => ({
		featureFlags: locals.featureFlags,
		requestInfo: locals.requestInfo,
		viewerRole: locals.viewerRole,
	}),
	render: ({ featureFlags, requestInfo, viewerRole }) => {
		return (
			<div class="section--split" data-testid={getPageTestId('/patterns/middleware')}>
				<section class="card">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Page middleware</p>
					<h1 class="mt-3 font-display text-4xl font-semibold tracking-tight">
						Request locals reach render through props.
					</h1>
					<p class="mt-4 text-base leading-8 text-muted">
						The middleware for this route is made with createMiddleware and passes a request id, feature
						flags, and viewer role to next(). The page's props hook reads them from its typed locals and
						returns what render needs, and the layout entry's props factory passes the request id and role
						to the layout header.
					</p>
					<div class="mt-6 flex flex-wrap gap-2">
						{featureFlags.map((flag) => (
							<span class="badge">{flag}</span>
						))}
					</div>
				</section>

				<section class="card card--accent">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Live request state</p>
					<dl class="mt-5 grid gap-4 sm:grid-cols-2">
						<div class="card p-4">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Request id</dt>
							<dd class="mt-2 font-mono text-lg text-on-background">{requestInfo.requestId}</dd>
						</div>
						<div class="card p-4">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Role</dt>
							<dd class="mt-2 text-lg font-semibold text-on-background">{viewerRole}</dd>
						</div>
						<div class="card p-4 sm:col-span-2">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Path</dt>
							<dd class="mt-2 font-mono text-sm text-on-background">{requestInfo.pathname}</dd>
						</div>
						<div class="card p-4 sm:col-span-2">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Generated at</dt>
							<dd class="mt-2 font-mono text-sm text-on-background">{requestInfo.receivedAt}</dd>
						</div>
					</dl>
				</section>
			</div>
		);
	},
});
