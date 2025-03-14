import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata } from '@ecopages/core';
import type { RenderImageToString } from '@ecopages/image-processor/image-renderer-provider';
import { imageRenderer } from 'eco.config';

export const getMetadata: GetMetadata = () => ({
  title: 'Images Labs page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const Image = (props: RenderImageToString) => {
  return imageRenderer.renderImageToString(props);
};

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout class="grid gap-8">
      <script type="application/json" id="eco-images-config">
        {JSON.stringify(global.ecoConfig.imageOptimization?.processor?.config)}
      </script>
      <h1 class="main-title">Images</h1>
      <a href="/labs/client-images" class="text-blue-500">
        Go to client images
      </a>
      <div class="max-w-80 mx-auto">
        <Image src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" priority unstyled />
        <Image src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" />
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map(() => (
          <Image src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg" alt="Demo" />
        ))}
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Image
            src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
            alt="Demo"
            staticVariant="sm"
            layout="full-width"
            unstyled={index === 3}
          />
        ))}
      </div>
      <Image src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" staticVariant="md" />
      <Image src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" />
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
