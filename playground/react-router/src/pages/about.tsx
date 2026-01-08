import type { GetMetadata } from '@ecopages/core';
import { createPage } from '@ecopages/react-router';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
	title: 'About | Blog',
	description: 'About the EcoPages React Router project',
});

const AboutContent = () => {
	return (
		<>
			<a href="/" className="back-link">
				← Back to Blog
			</a>

			<article className="post-content">
				<h1>About This Project</h1>
				<p>
					This is a proof-of-concept for SPA navigation in EcoPages. We fetch full HTML, parse it for the
					component and props, then dynamically import and render without a full page reload.
				</p>
			</article>

			<div style={{ marginTop: '3rem' }}></div>
		</>
	);
};

export default createPage(AboutContent, (children) => <BaseLayout>{children}</BaseLayout>, {
	dependencies: { components: [BaseLayout] },
});
