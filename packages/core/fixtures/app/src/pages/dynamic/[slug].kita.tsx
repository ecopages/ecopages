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
};

const BlogPost: EcoPage<PageProps<BlogPostProps>> = ({ query, slug }) => {
  return (
    <BaseLayout>
      <div>
        <h1 safe>
          Blog Post {slug} {JSON.stringify(query || [])}
        </h1>
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
