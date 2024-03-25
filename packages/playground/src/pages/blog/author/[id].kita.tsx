import type { GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from "@eco-pages/core";

type Author = {
  slug: string;
  name: string;
  bio: string;
};

export const getMetadata: GetMetadata<Author> = async ({ name, slug }) => {
  return {
    title: `Author | ${slug}`,
    description: `This is the bio of ${name}`,
  };
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

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{ params: { id: "author-one" } }, { params: { id: "author-two" } }],
  };
};

export const getStaticProps: GetStaticProps<Author> = async ({ pathname }) => {
  return {
    props: {
      slug: pathname.params.id,
      name: pathname.params.id,
      bio: "This is a bio",
    },
    metadata: {
      title: `Hello World | ${pathname.params.slug}`,
      description: "This is a bio",
    },
  };
};
