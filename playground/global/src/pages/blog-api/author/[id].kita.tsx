import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata, GetStaticPaths, GetStaticProps, PageProps } from '@ecopages/core';

type AuthorProps = {
  slug: string;
  name: string;
  bio: string;
};

export const Author: EcoComponent<PageProps<AuthorProps>> = ({ params, query, name, bio, slug }) => {
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
};

Author.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export default Author;

export const getMetadata: GetMetadata<AuthorProps> = async ({ props: { name, slug } }) => {
  return {
    title: `Author | ${slug}`,
    description: `This is the bio of ${name}`,
  };
};

export const getStaticPaths: GetStaticPaths = async ({ appConfig }) => {
  const response = await fetch(`${appConfig.baseUrl}/api/blog/authors`);
  const paths = await response.json();
  return { paths };
};

export const getStaticProps: GetStaticProps<AuthorProps> = async ({ pathname, appConfig }) => {
  const id = pathname.params.id as string;
  const response = await fetch(`${appConfig.baseUrl}/api/blog/author/${id}`);

  if (!response.ok) {
    throw new Error(`Author with id "${id}" not found`);
  }

  const author = await response.json();

  return {
    props: {
      slug: author.slug,
      name: author.name,
      bio: author.bio,
    },
  };
};
