import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	render: () => {
		return (
			<div class="prose">
				<h1>Docs starter</h1>
				<p>
					<a href="/docs/getting-started/introduction">Open the docs</a>
				</p>
			</div>
		);
	},
});
