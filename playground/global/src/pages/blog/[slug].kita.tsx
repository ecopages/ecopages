import type { EcoComponent, GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { getAllBlogPostSlugs, getBlogPost } from '@/mocks/data';

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

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: getAllBlogPostSlugs() };
};

export const getStaticProps: GetStaticProps<BlogPostProps> = async ({ pathname }) => {
  const slug = pathname.params.slug as string;
  const blogPost = getBlogPost(slug);
  if (!blogPost) throw new Error(`Blog post with slug "${slug}" not found`);
  return {
    props: {
      slug,
      title: blogPost.title,
      text: blogPost.text,
    },
  };
};

export default BlogPost;
