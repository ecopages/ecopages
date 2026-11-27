import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout.kita';

export default eco.page({
	layout: BaseLayout,

	dependencies: {
		scripts: ['../../layouts/base-layout.script.ts'],
	},

	metadata: () => ({
		title: 'Prefetch Product',
		description: 'Destination page with a high-priority image for prefetch tests',
	}),

	render: () => (
		<div data-testid="product-page">
			<h1>Prefetch Product</h1>
			<img src="/prefetch-images/chair.svg" fetchpriority="high" alt="Chair" width="40" height="40" />
			<img src="/prefetch-images/lazy.svg" loading="lazy" alt="Lazy" width="40" height="40" />
			<img src="/prefetch-images/plain.svg" alt="Plain" width="40" height="40" />
		</div>
	),
});
