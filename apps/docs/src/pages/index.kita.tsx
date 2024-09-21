import { DocsLayout } from '@/layouts/docs-layout';
import Introduction from '@/pages/docs/getting-started/introduction.mdx';
import type { EcoPage, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Ecopages - Docs',
  description: 'Simple and fast static site generator.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
});

const HomePage: EcoPage = () => {
  return (
    <DocsLayout class="main-content">
      <Introduction />
    </DocsLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [DocsLayout],
  },
};

export default HomePage;
