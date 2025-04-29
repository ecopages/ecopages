import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';

export type BlogPostProps = {
  slug: string;
  title: string;
  text: string;
};

const BlogPost: EcoComponent<PageProps<BlogPostProps>> = ({ params, query, title, text, slug }) => {
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

BlogPost.config = {
  importMeta: import.meta,
  dependencies: { components: [BaseLayout] },
};

export const getMetadata: GetMetadata<BlogPostProps> = async ({ props: { title, slug } }) => {
  return {
    title,
    description: `This is a blog post with the slug ${slug}`,
  };
};

export const getStaticPaths: GetStaticPaths = async ({ runtimeOrigin }) => {
  const response = await fetch(`${runtimeOrigin}/api/blog/posts`);
  const paths = await response.json();
  return { paths };
};

export const getStaticProps: GetStaticProps<BlogPostProps> = async ({ pathname, runtimeOrigin }) => {
  const slug = pathname.params.slug as string;
  const response = await fetch(`${runtimeOrigin}/api/blog/post/${slug}`);

  if (!response.ok) {
    throw new Error(`Blog post with slug "${slug}" not found`);
  }

  const blogPost = await response.json();

  return {
    props: {
      slug,
      title: blogPost.title,
      text: blogPost.text,
    },
  };
};

export default BlogPost;
