import { eco } from '@ecopages/core';
import { ezi76Gu53NklsuUnsplashJpg } from 'ecopages:images';
import { EcoImage } from '@ecopages/image-processor/component/html';
import { AlpineCounter } from '@/components/alpine-counter';
import Introduction from '@/components/introduction.mdx';
import { LitCounter } from '@/components/lit-counter';
import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';

export default eco.page({
	dependencies: {
		stylesheets: ['./index.css'],
		components: [BaseLayout, AlpineCounter, RadiantCounter, LitCounter],
	},

	metadata: () => ({
		title: 'Home page',
		description: 'This is the homepage of the website',
		image: 'public/assets/images/default-og.png',
		keywords: ['typescript', 'framework', 'static'],
	}),

	render: () => {
		return (
			<BaseLayout class="main-content">
				<h1 class="main-title text-4xl">Home</h1>
				<EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="A computer" width={500} height={500} />
				<div class="prose">
					<Introduction className="prose" />
				</div>
				<span class="font-bold text-xl">Alpine Counter</span>
				<AlpineCounter />
				<span class="font-bold text-xl">Radiant Counter</span>
				<RadiantCounter count={5} />
				<span class="font-bold text-xl">Lit Counter</span>
				<LitCounter count={8} />
				<EndpointsTesting />
			</BaseLayout>
		);
	},
});

const EndpointsTesting = () => {
	return (
		<div class="prose">
			<h2>Endpoints Testing</h2>
			<h3 class="font-bold mt-4">Blog Posts</h3>
			<p>
				<a href="/api/blog/posts" class="text-blue-500 hover:underline">
					/api/blog/posts
				</a>
			</p>
			<p>
				<a href="/api/blog/post/post-1" class="text-blue-500 hover:underline">
					/api/blog/post/post-1
				</a>
			</p>
			<h3 class="font-bold mt-4">Authors</h3>
			<p>
				<a href="/api/blog/authors" class="text-blue-500 hover:underline">
					/api/blog/authors
				</a>
			</p>
			<p>
				<a href="/api/blog/author/author-1" class="text-blue-500 hover:underline">
					/api/blog/author/author-1
				</a>
			</p>
			<h3 class="font-bold mt-4">Subpath Test</h3>
			<p>
				<a href="/api/test/123/subpath/example" class="text-blue-500 hover:underline">
					/api/test/123/subpath/example
				</a>
			</p>
			<p>
				<a href="/api/test/456/subpath/test" class="text-blue-500 hover:underline">
					/api/test/456/subpath/test
				</a>
			</p>
			<h3 class="font-bold mt-4">Catch-all Route</h3>
			<p>
				<a href="/api/anything/here" class="text-blue-500 hover:underline">
					/api/anything/here
				</a>
			</p>
			<p>
				<a href="/api/test/catch/all/example" class="text-blue-500 hover:underline">
					/api/test/catch/all/example
				</a>
			</p>
		</div>
	);
};
