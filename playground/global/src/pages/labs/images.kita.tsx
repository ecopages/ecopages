import { ezi76Gu53NklsuUnsplashJpg, theodorePoncetQzephogqd7WUnsplashJpg } from 'ecopages:images';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/html';

export const getMetadata: GetMetadata = () => ({
  title: 'Images Labs page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout class="grid gap-8">
      <h1 class="main-title">Images</h1>
      <a href="/labs/client-images" class="text-blue-800 hover:underline">
        Go to client images
      </a>
      <div class="max-w-80 mx-auto">
        <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Ezi unsplash" priority unstyled />
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map(() => (
          <EcoImage {...theodorePoncetQzephogqd7WUnsplashJpg} alt="Demo" />
        ))}
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage
            {...theodorePoncetQzephogqd7WUnsplashJpg}
            alt="Demo"
            staticVariant="sm"
            layout="full-width"
            unstyled={index === 3}
          />
        ))}
      </div>
      <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Ezi unsplash" staticVariant="md" />
      <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Ezi unsplash" />
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export default HomePage;
