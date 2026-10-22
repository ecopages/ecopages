import { eco, type ErrorPageTemplateProps } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { SiteLayout } from '@/layouts/site-layout/site-layout';

export default eco.page<ErrorPageTemplateProps, JsxRenderable>({
	layout: SiteLayout,
	metadata: () => ({
		title: 'Something went wrong | EcoBlog',
		description: 'The server could not render this page.',
	}),
	render: ({ message, stack }) => (
		<section class="error-page">
			<h1>Something went wrong</h1>
			<p>{message ?? 'The server could not render this page.'}</p>
			{stack ? <pre class="error-page__stack">{stack}</pre> : null}
			<RuiButton href="/" variant="outline">
				Back to all posts
			</RuiButton>
		</section>
	),
});
