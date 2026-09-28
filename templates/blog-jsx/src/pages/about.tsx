import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page<{}, JsxRenderable>({
	layout: { component: BaseLayout, props: () => ({ prose: true }) },

	metadata: () => ({
		title: 'About | Blog',
		description: 'About the EcoPages Browser Router project',
	}),

	render: () => {
		return (
			<>
				<RuiButton href="/" variant="ghost" size="sm" class="back-link unstyled">
					← Back to Blog
				</RuiButton>
				<h1>About This Project</h1>
				<p>
					This is a proof-of-concept for SPA navigation in EcoPages using the Browser Router. We fetch full
					HTML, morph the DOM, and support View Transitions without a full page reload.
				</p>
			</>
		);
	},
});
