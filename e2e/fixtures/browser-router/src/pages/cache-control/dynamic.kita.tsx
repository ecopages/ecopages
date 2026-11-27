import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

let renders = 0;

export default eco.page({
	layout: BaseLayout,
	cache: 'dynamic',

	metadata: () => ({
		title: 'Dynamic page',
		description: 'A page rendered on every request, so the router must not reuse it',
	}),

	render: () => {
		renders += 1;
		return (
			<div data-testid="dynamic-page">
				<h1>Dynamic page</h1>
				<p>
					Render <span data-testid="render-count">{renders}</span>
				</p>
				<a href="/cache-control/static" data-testid="link-static" data-eco-no-prefetch>
					Static page
				</a>
			</div>
		);
	},
});
