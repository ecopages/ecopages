import type { PageProps, GetStaticPaths, GetStaticProps, EcoPage } from "@eco-pages/core";

export type BlogPost = {
  slug: string;
  title: string;
  text: string;
};

const BlogPost: EcoPage<PageProps<BlogPost>> = ({ params, query, title, text, slug }) => {
  return (
    <div>
      <h1 safe>
        Blog Post {params?.slug} {JSON.stringify(query || [])}
      </h1>
      <h2>{title as "safe"}</h2>
      <p>{text as "safe"}</p>
      <p>{slug as "safe"}</p>
    </div>
  );
};

BlogPost.renderStrategy = "static";

export const getStaticPaths = (async () => {
  return {
    paths: [{ params: { slug: "blog-post" } }, { params: { slug: "another-blog-post" } }],
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  return {
    props: {
      slug: context.pathname.params.slug,
      title: `Hello World | ${context.pathname.params.slug}`,
      text: "This is a blog post",
    },
    metadata: {
      title: `Hello World | ${context.pathname.params.slug}`,
      description: "This is a blog post",
    },
  };
}) satisfies GetStaticProps<BlogPost>;

export default BlogPost;
