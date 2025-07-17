import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'Images Labs page',
	description: 'This is the homepage of the website',
	image: 'public/assets/images/default-og.png',
	keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
	return (
		<BaseLayout class="grid gap-8">
			<h1 class="main-title">Images</h1>
			<eco-images>
				<button type="button" data-ref="create-img" class="px-6 py-3 bg-slate-800 text-white rounded-sm">
					Create random image
				</button>
				<div data-ref="container"></div>
			</eco-images>
		</BaseLayout>
	);
};

HomePage.config = {
	importMeta: import.meta,
	dependencies: {
		components: [BaseLayout],
		scripts: ['./client-images.script.ts'],
	},
};

export default HomePage;
