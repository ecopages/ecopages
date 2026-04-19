import { eco } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import Introduction from '@/pages/docs/getting-started/introduction.mdx';

export default eco.page({
	dependencies: {
		components: [DocsLayout],
	},

	metadata: () => ({
		title: 'Ecopages - Docs',
		description: 'Simple and fast static site generator.',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
	}),

	render: () => {
		return (
			<DocsLayout class="main-content">
				<Introduction />
			</DocsLayout>
		);
	},
});
