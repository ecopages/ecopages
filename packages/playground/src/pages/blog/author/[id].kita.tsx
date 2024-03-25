import type { GetStaticPaths, GetStaticProps, PageProps } from "@eco-pages/core";

type Author = {
  slug: string;
  name: string;
  bio: string;
};

export default function Author({ params, query, name, bio, slug }: PageProps<Author>) {
  return (
    <div>
      <h1 safe>
        Author {params?.id} {JSON.stringify(query || [])}
      </h1>
      <h2 safe>{name}</h2>
      <p safe>{bio}</p>
      <p safe>{slug}</p>
    </div>
  );
}

Author.renderStrategy = "static";

export const getStaticPaths = (async () => {
  return {
    paths: [{ params: { id: "author-one" } }, { params: { id: "author-two" } }],
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  return {
    props: {
      slug: context.pathname.params.id,
      name: context.pathname.params.id,
      bio: "This is a bio",
    },
    metadata: {
      title: `Hello World | ${context.pathname.params.slug}`,
      description: "This is a bio",
    },
  };
}) satisfies GetStaticProps<Author>;
