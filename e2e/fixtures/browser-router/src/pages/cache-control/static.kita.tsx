import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	metadata: () => ({
		title: 'Static page',
		description: 'A page built once, so the router reuses its document',
	}),

	render: () => (
		<div data-testid="static-page">
			<h1>Static page</h1>
			<a href="/cache-control/dynamic" data-testid="link-dynamic" data-eco-no-prefetch>
				Dynamic page
			</a>
		</div>
	),
});
