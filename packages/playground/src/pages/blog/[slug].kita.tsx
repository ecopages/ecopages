import { BaseLayout } from "@/layouts/base-layout";
import {
  type PageProps,
  type GetStaticPaths,
  type GetStaticProps,
  type EcoPage,
  DepsManager,
  type GetMetadata,
} from "@eco-pages/core";

export type BlogPost = {
  slug: string;
  title: string;
  text: string;
};

export const getMetadata: GetMetadata<BlogPost> = async ({ title, slug }) => {
  return {
    title,
    description: `This is a blog post with the slug ${slug}`,
  };
};

const BlogPost: EcoPage<PageProps<BlogPost>> = ({ params, query, title, text, slug }) => {
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
    paths: [{ params: { slug: "blog-post" } }, { params: { slug: "another-blog-post" } }],
  };
};

export const getStaticProps: GetStaticProps<BlogPost> = async ({ pathname }) => {
  return {
    props: {
      slug: pathname.params.slug as string,
      title: `Hello World | ${pathname.params.slug}`,
      text: "This is a blog post",
    },
  };
};

export default BlogPost;
