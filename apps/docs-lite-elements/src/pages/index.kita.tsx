import { DocsLayout } from '@/layouts/docs-layout';
import Introduction from '@/pages/docs/getting-started/introduction.mdx';
import { DepsManager, type EcoPage, type GetMetadata } from '@eco-pages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Eco Pages - Docs',
  description: 'Simple and fast static site generator with TypeScript and Lit and Kita.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
});

const HomePage: EcoPage = () => {
  return (
    <DocsLayout>
      <Introduction />
    </DocsLayout>
  );
};

HomePage.dependencies = DepsManager.importPaths({
  importMeta: import.meta,
  stylesheets: ['./index.css'],
  components: [DocsLayout],
});

export default HomePage;
