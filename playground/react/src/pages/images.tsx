import ImageGeneration from '@/components/image-generator';
import { BaseLayout } from '@/layouts/base-layout';
import type { EcoPage, GetMetadata } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/react';
import type { JSX } from 'react';

export const getMetadata: GetMetadata = () => ({
  title: 'Images Labs page',
  description: 'This is the test page for images',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const ImagesPage: EcoPage<unknown, JSX.Element> = () => {
  return (
    <BaseLayout class="grid gap-8">
      <h1 className="main-title">Images</h1>
      <ImageGeneration />
      <div className="max-w-80 mx-auto">
        <EcoImage src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" priority unstyled />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage
            key={`img-${index}`}
            src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
            alt="Demo"
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage
            key={`img-${index}`}
            src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
            alt="Demo"
            staticVariant="sm"
            layout="full-width"
            unstyled={index === 3}
          />
        ))}
      </div>
      <EcoImage src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" staticVariant="md" />
      <EcoImage src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" />
    </BaseLayout>
  );
};

ImagesPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export default ImagesPage;
