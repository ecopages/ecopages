import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { DocsLayout } from '@/layouts/docs-layout';
import Introduction from '@/pages/docs/getting-started/introduction.mdx';

export const getMetadata: GetMetadata = () => ({
  title: 'Ecopages - Docs',
  description: 'Simple and fast static site generator.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
});

const HomePage: EcoComponent = () => {
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
