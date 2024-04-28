import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@eco-pages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
  return <BaseLayout class="main-content">Docs</BaseLayout>;
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout],
});

export default HomePage;
