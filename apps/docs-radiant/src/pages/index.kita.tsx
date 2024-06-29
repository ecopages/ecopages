import { DocsLayout } from '@/layouts/docs-layout';
import Introduction from '@/pages/docs/getting-started/introduction.mdx';
import { DepsManager, type EcoPage, type GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Radiant | Docs',
  description: 'Radiant is a minimalist web component library designed for simplicity and flexibility.',
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

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  stylesheets: ['./index.css'],
  components: [DocsLayout],
});

export default HomePage;
