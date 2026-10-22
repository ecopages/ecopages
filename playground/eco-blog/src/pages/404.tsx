import { eco, type ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { SiteLayout } from '@/layouts/site-layout/site-layout';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: SiteLayout,
	metadata: () => ({ title: 'Page not found | EcoBlog', description: 'This page does not exist.' }),
	render: () => (
		<section class="error-page">
			<h1>Page not found</h1>
			<p>The page you are looking for does not exist or was removed.</p>
			<RuiButton href="/" variant="outline">
				Back to all posts
			</RuiButton>
		</section>
	),
});
