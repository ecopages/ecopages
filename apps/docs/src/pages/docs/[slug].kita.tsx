import { ApiField } from '@/components/api-field/api-field.kita';
import { CodeBlock } from '@/components/code-block/code-block.kita';
import { docsConfig } from '@/docs/config';
import { DocsLayout } from '@/layouts/docs-layout';
import {
  DepsManager,
  type EcoPage,
  type GetMetadata,
  type GetStaticPaths,
  type GetStaticProps,
  type StaticPath,
} from '@eco-pages/core';

type DocPage = {
  Content: () => JSX.Element;
};

const DocPage: EcoPage<DocPage> = ({ Content }) => {
  return (
    <DocsLayout class="prose">
      <Content />
    </DocsLayout>
  );
};

DocPage.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  components: [DocsLayout, ApiField, CodeBlock],
});

export default DocPage;

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: docsConfig.reduce((acc, group) => {
      return acc.concat(
        group.pages.map((page) => ({
          params: { slug: page.path.replace('/docs/', '') },
        })),
      );
    }, [] as StaticPath[]),
  };
};

export const getStaticProps: GetStaticProps<DocPage> = async ({ pathname }) => {
  const { default: Content } = await import(`@/docs/${pathname.params.slug}.mdx`);
  return {
    props: {
      Content: Content,
    },
  };
};

export const getMetadata: GetMetadata<DocPage> = async ({ params }) => {
  return {
    title: `Docs | ${params.slug}`,
    description: 'The place to learn about Eco Pages',
  };
};
