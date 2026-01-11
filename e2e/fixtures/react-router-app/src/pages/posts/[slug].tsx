import type { EcoComponent, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

import './[slug].css';

type PostPageProps = {
	slug: string;
};

export const getStaticPaths: GetStaticPaths = async () => {
	return {
		paths: [{ params: { slug: 'test-post' } }, { params: { slug: 'another-post' } }],
	};
};

export const getStaticProps: GetStaticProps<PostPageProps> = async ({ pathname }) => {
	const slug = pathname.params.slug as string;
	return {
		props: {
			slug,
		},
	};
};

const PostPage: EcoComponent<PageProps<PostPageProps>> = ({ slug }) => {
	return (
		<div data-testid="post-page">
			<h1 data-testid="post-title" data-view-transition={`post-title-${slug}`}>
				Post: {slug}
			</h1>
			<nav>
				<a href="/" data-testid="link-home">
					Back to Home
				</a>
			</nav>
		</div>
	);
};

PostPage.config = {
	layout: BaseLayout,
	dependencies: {
		stylesheets: ['./[slug].css'],
	},
};

export default PostPage;
