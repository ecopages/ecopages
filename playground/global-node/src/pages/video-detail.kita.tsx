import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		components: [BaseLayout],
	},

	metadata: () => ({
		title: 'Video Detail',
		description: 'This is a detail page of a video',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	layout: BaseLayout,

	render: () => (
		<div class="max-w-4xl mx-auto py-12">
			<a href="/video" class="inline-flex items-center text-blue-600 hover:underline mb-8">
				&larr; Back to Gallery
			</a>

			<div class="bg-white rounded-xl shadow-lg overflow-hidden">
				<div class="aspect-video bg-black w-full">
					<video
						data-eco-persist="flower-video"
						data-eco-transition="slide"
						src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
						controls
						class="w-full h-full object-contain"
						autoplay
						muted
						loop
						playsInline
					/>
				</div>
				<div class="p-8">
					<h1 class="text-3xl font-bold mb-4">Beautiful Flower Details</h1>
					<p class="text-gray-700 text-lg leading-relaxed">
						This is the detail view of the video. Notice how the video continued playing exactly where it
						left off, even though the layout and DOM position changed completely. This is powered by{' '}
						<code>data-eco-persist</code>.
					</p>
				</div>
			</div>
		</div>
	),
});
