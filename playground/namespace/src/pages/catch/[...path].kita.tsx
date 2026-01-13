import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';
import { BackLink } from '@/components/back-link.kita';
import { Card, CardTitle } from '@/components/card.kita';
import { Alert } from '@/components/alert.kita';

export default eco.page({
	layout: BaseLayout,

	metadata: () => ({
		title: 'Catch All | Eco Namespace',
		description: 'A catch-all route that captures any path',
	}),

	render: ({ params, query }) => (
		<div class="max-w-3xl mx-auto space-y-8">
			<header class="space-y-4">
				<BackLink />
				<h1 class="text-4xl font-bold text-white">Catch-All Route</h1>
				<p class="text-gray-400">
					This page catches any path under <code>/catch/*</code>
				</p>
			</header>

			<section class="space-y-4">
				<Card>
					<CardTitle>Route Parameters</CardTitle>
					<pre class="text-sm text-gray-300 overflow-x-auto">
						<code safe>{JSON.stringify(params, null, 2)}</code>
					</pre>
				</Card>

				<Card>
					<CardTitle>Query Parameters</CardTitle>
					<pre class="text-sm text-gray-300 overflow-x-auto">
						<code safe>
							{Object.keys(query || {}).length > 0
								? JSON.stringify(query, null, 2)
								: 'No query parameters'}
						</code>
					</pre>
				</Card>
			</section>

			<Alert variant="warning" title="Note">
				Catch-all routes are not supported in static generation mode. They only work in development/server mode.
			</Alert>
		</div>
	),
});
