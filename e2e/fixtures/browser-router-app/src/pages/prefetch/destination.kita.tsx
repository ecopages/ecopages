import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		scripts: ['../../layouts/base-layout.script.ts'],
		stylesheets: ['./destination.css'],
	},

	metadata: () => ({
		title: 'Prefetch Destination',
		description: 'Destination page for prefetch tests',
	}),

	render: () => {
		return (
			<div class="destination-page">
				<h1>Prefetch Destination</h1>
				<p>This page is used to test prefetch functionality.</p>
				<a href="/prefetch" id="back-link">
					Back to tests
				</a>
			</div>
		);
	},
});
