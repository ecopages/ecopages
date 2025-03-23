import images from 'ecopages:images';
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
        <EcoImage {...images['ezi-76GU53nkLSU-unsplash.jpg']} alt="Ezi unsplash" priority unstyled />
        {/* <EcoImage {...images['not-existing.png']} alt="Not existing" /> */}
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map(() => (
          <EcoImage {...images['theodore-poncet-QZePhoGqD7w-unsplash.jpg']} alt="Demo" />
        ))}
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage
            {...images['theodore-poncet-QZePhoGqD7w-unsplash.jpg']}
            alt="Demo"
            staticVariant="sm"
            layout="full-width"
            unstyled={index === 3}
          />
        ))}
      </div>
      <EcoImage {...images['ezi-76GU53nkLSU-unsplash.jpg']} alt="Ezi unsplash" staticVariant="md" />
      <EcoImage {...images['ezi-76GU53nkLSU-unsplash.jpg']} alt="Ezi unsplash" />
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
