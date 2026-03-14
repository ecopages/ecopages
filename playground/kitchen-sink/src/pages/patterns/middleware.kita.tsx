import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { requestInfoMiddleware } from '@/handlers/demo-middleware';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
		stylesheets: ['./middleware.css'],
	},
	layout: BaseLayout,
	cache: 'dynamic',
	middleware: [requestInfoMiddleware],
	requires: ['featureFlags', 'requestInfo', 'viewerRole'] as const,
	metadata: () => ({
		title: 'Middleware locals',
		description: 'Request middleware populates locals that are consumed by both the page and the layout.',
	}),
	render: ({ locals }) => {
		return (
			<div class="section--split">
				<section class="card">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Page middleware</p>
					<h1 class="mt-3 font-display text-4xl font-semibold tracking-tight">Request locals become normal render inputs.</h1>
					<p class="mt-4 text-base leading-8 text-muted">
						The middleware for this route attaches a request id, feature flags, and viewer role before rendering the page. The same locals also appear in the layout header.
					</p>
					<div class="mt-6 flex flex-wrap gap-2">
						{locals?.featureFlags?.map((flag) => (
							<span class="badge">
								{flag}
							</span>
						))}
					</div>
				</section>

				<section class="card card--accent">
					<p class="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Live request state</p>
					<dl class="mt-5 grid gap-4 sm:grid-cols-2">
						<div class="card p-4">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Request id</dt>
							<dd class="mt-2 font-mono text-lg text-on-background">{locals?.requestInfo?.requestId}</dd>
						</div>
						<div class="card p-4">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Role</dt>
							<dd class="mt-2 text-lg font-semibold text-on-background">{locals?.viewerRole}</dd>
						</div>
						<div class="card p-4 sm:col-span-2">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Path</dt>
							<dd class="mt-2 font-mono text-sm text-on-background">{locals?.requestInfo?.pathname}</dd>
						</div>
						<div class="card p-4 sm:col-span-2">
							<dt class="text-xs uppercase tracking-[0.24em] text-muted">Generated at</dt>
							<dd class="mt-2 font-mono text-sm text-on-background">{locals?.requestInfo?.receivedAt}</dd>
						</div>
					</dl>
				</section>
			</div>
		);
	},
});