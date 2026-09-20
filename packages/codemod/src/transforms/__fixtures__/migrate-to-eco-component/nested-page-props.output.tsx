import { eco } from '@ecopages/core';

type BlogProps = { slug: string };

const BlogPost = eco.component<BlogProps>({
	dependencies: { stylesheets: ['./blog.css'] },
	render: ({ slug }) => <article>{slug}</article>,
});

export { BlogPost };
