import { Counter } from '@/components/counter';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';
import type { JSX } from 'react';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the test of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const TestPage: EcoPage<unknown, JSX.Element> = () => {
  return (
    <BaseLayout className="main-content">
      <h1 className="main-title">Ecopages</h1>
      <a href="/about" className="text-blue-700 underline">
        Mdx
      </a>
      <a href="/" className="text-blue-700 underline">
        Home
      </a>
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
