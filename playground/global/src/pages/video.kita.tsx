import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	layout: BaseLayout,

	render: () => (
		<div class="max-w-4xl mx-auto py-12">
			<h1 class="text-4xl font-bold mb-8">Video Persistence Demo</h1>
			<p class="mb-8 text-lg">
				Click the video card to go to the detail page. The video should keep playing without interruption.
			</p>
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<a href="/video-detail" class="block group">
					<div class="bg-white rounded-lg shadow-md overflow-hidden transition-transform transform hover:scale-105">
						<div class="aspect-video bg-black relative">
							<video
								data-eco-persist="flower-video"
								data-eco-transition="slide"
								src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
								controls
								class="w-full h-full object-cover"
								autoplay
								muted
								loop
								playsInline
							/>
						</div>
						<div class="p-4">
							<h3 class="font-bold text-xl mb-2">Beautiful Flower</h3>
							<p class="text-gray-600">Watch this amazing nature video.</p>
						</div>
					</div>
				</a>
			</div>
		</div>
	),
});
