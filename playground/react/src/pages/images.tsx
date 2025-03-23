import { ezi76Gu53NklsuUnsplashJpg, theodorePoncetQzephogqd7WUnsplashJpg } from 'ecopages:images';
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
        <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="Ezi unsplash" priority unstyled />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage key={`img-${index}`} {...theodorePoncetQzephogqd7WUnsplashJpg} alt="Demo" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <EcoImage
            key={`img-${index}`}
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

ImagesPage.config = {
  importMeta: import.meta,
  dependencies: {
    components: [BaseLayout],
  },
};

export default ImagesPage;
