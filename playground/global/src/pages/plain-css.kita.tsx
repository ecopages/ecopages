import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout>
      <h1 class="title">Home</h1>
      <p class="description">
        This page is styled with plain CSS. You can find the styles in <code>plain-css.css</code>.
      </p>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./plain-css.css'],
    components: [BaseLayout],
  },
};

export default HomePage;
