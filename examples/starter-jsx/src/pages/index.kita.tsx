import { Card } from '@/components/card';
import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <>
        <h1 class="main-title">Ecopages</h1>
        <a href="/about">Mdx</a>
        <RadiantCounter count={0} />
        <Card
          title="Card title"
          copy={
            <p>
              This is a card component. It is a reusable component that can be used to display content in a consistent
              manner.
            </p>
          }
        />
      </>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [BaseLayout, Card, RadiantCounter],
  },
};

export default HomePage;
