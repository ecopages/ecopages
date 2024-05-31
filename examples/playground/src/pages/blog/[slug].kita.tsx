import { BaseLayout } from '@/layouts/base-layout';
import {
  DepsManager,
  type EcoPage,
  type GetMetadata,
  type GetStaticPaths,
  type GetStaticProps,
  type PageProps,
} from '@ecopages/core';

export type BlogPostProps = {
  slug: string;
  title: string;
  text: string;
};

export const getMetadata: GetMetadata<BlogPostProps> = async ({ title, slug }) => {
  return {
    title,
    description: `This is a blog post with the slug ${slug}`,
  };
};

const BlogPost: EcoPage<PageProps<BlogPostProps>> = ({ params, query, title, text, slug }) => {
  return (
    <BaseLayout>
      <div>
        <h1 safe>
          Blog Post {params?.slug} {JSON.stringify(query || [])}
        </h1>
        <h2 safe>{title}</h2>
        <p safe>{text}</p>
        <p safe>{slug}</p>
      </div>
    </BaseLayout>
  );
};

BlogPost.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{ params: { slug: 'blog-post' } }, { params: { slug: 'another-blog-post' } }],
  };
};

export const getStaticProps: GetStaticProps<BlogPostProps> = async ({ pathname }) => {
  return {
    props: {
      slug: pathname.params.slug as string,
      title: `Hello World | ${pathname.params.slug}`,
      text: 'This is a blog post',
    },
  };
};

export default BlogPost;
