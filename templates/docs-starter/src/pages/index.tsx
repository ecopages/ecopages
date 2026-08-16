import { eco } from '@ecopages/core';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	layout: BaseLayout,
	render: () => {
		return (
			<div class="prose">
				<h1>Docs starter</h1>
				<p>
					<RuiButton href="/docs/getting-started/introduction">Open the docs</RuiButton>
				</p>
			</div>
		);
	},
});
