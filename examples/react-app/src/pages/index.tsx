import { Counter } from '@/components/counter/counter';
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
        <h1 className="main-title">Eco pages</h1>
        <a href="/about">Mdx</a>
        <a href="/test">Test Splitting</a>
        <Counter defaultValue={10} />
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = {
  stylesheets: [
    'pages/index.css',
    ...(Counter.dependencies?.stylesheets ?? []),
    ...(BaseLayout.dependencies?.stylesheets ?? []),
  ],
  scripts: ['pages/index.script.js'],
};
export default HomePage;
