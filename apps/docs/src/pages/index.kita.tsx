import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@eco-pages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Eco Pages - Docs',
  description: 'Simple and fast static site generator with TypeScript and Lit and Kita.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static', 'site', 'generator', 'lit', 'kita'],
});

const HomePage: EcoComponent = () => {
  return <BaseLayout class="main-content">Docs</BaseLayout>;
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export default HomePage;
