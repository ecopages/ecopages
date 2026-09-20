import type { EcoComponent, PageProps } from '@ecopages/core';

type BlogProps = { slug: string };

const BlogPost: EcoComponent<PageProps<BlogProps>> = ({ slug }) => <article>{slug}</article>;
BlogPost.config = { dependencies: { stylesheets: ['./blog.css'] } };

export { BlogPost };
