import { BaseLayout } from "@/layouts/base-layout";
import {
  DepsManager,
  type GetMetadata,
  type GetStaticPaths,
  type GetStaticProps,
  type PageProps,
} from "@eco-pages/core";

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
    <BaseLayout>
      <div>
        <h1 safe>
          Author {params?.id} {JSON.stringify(query || [])}
        </h1>
        <h2 safe>{name}</h2>
        <p safe>{bio}</p>
        <p safe>{slug}</p>
      </div>
    </BaseLayout>
  );
}

Author.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{ params: { id: "author-one" } }, { params: { id: "author-two" } }],
  };
};

export const getStaticProps: GetStaticProps<Author> = async ({ pathname }) => {
  return {
    props: {
      slug: pathname.params.id as string,
      name: pathname.params.id as string,
      bio: "This is a bio",
    },
  };
};
