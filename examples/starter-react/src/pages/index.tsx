import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoPage = () => {
  return (
    <BaseLayout class="main-content">
      <>
        <h1 className="main-title">React App</h1>
        <Counter defaultValue={10} />
      </>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [Counter, BaseLayout],
  },
};

export default HomePage;
