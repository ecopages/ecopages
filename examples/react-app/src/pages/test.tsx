import { Counter } from '@/components/counter/counter';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the test of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const TestPage: EcoPage = () => {
  return (
    <BaseLayout class="main-content">
      <h1 className="main-title">Ecopages</h1>
      <a href="/about">Mdx</a>
      <a href="/">Home</a>
      <Counter defaultValue={10} />
      <Counter defaultValue={5} />
    </BaseLayout>
  );
};

TestPage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [Counter, BaseLayout],
  },
};
export default TestPage;
