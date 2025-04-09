import { BaseLayout } from '@/layouts/base-layout';
import {
  type EcoComponent,
  type GetMetadata,
  type GetStaticPaths,
  type GetStaticProps,
  type PageProps,
  html,
} from '@ecopages/core';

export type BlogPostProps = {
  slug: string;
};

const BlogPost: EcoComponent<PageProps<BlogPostProps>> = ({ query, slug }) =>
  html`!${BaseLayout({
    children: html`<div>
        <h1>
          Blog Post ${slug} !${JSON.stringify(query || [])}
        </h1>
      </div>`,
  })}`;

BlogPost.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{ params: { slug: 'blog-post' } }, { params: { slug: 'another-blog-post' } }],
  };
};

export const getStaticProps: GetStaticProps<BlogPostProps> = async ({ pathname }) => {
  return {
    props: {
      slug: pathname.params.slug as string,
    },
  };
};

export const getMetadata: GetMetadata<BlogPostProps> = async ({ params }) => {
  return {
    title: `Hello World | ${params.slug}`,
    description: 'This is a blog post',
  };
};

export default BlogPost;
