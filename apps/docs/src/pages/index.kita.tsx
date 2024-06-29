import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoPage, type GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Eco Pages - Docs',
  description: 'Simple and fast static site generator with TypeScript and Lit and Kita.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
});

const HomePage: EcoPage = () => {
  return (
    <BaseLayout class="main-content">
      <a href="/docs/getting-started/introduction">Docs</a>
    </BaseLayout>
  );
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  stylesheets: ['./index.css'],
  components: [BaseLayout],
});

export default HomePage;
