import { BaseLayout } from '@/layouts/base-layout';
import { type EcoComponent, type GetMetadata, removeComponentsScripts } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Images Labs page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

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
        <img
          class="object-fit"
          src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg"
          alt="Ezi unsplash"
          loading="lazy"
        />
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map(() => (
          <img src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg" alt="Demo" />
        ))}
      </div>
      <div class="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <img
            src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
            alt="Demo"
            data-static-variant="sm"
            data-layout="constrained"
            width={200}
            data-unstyled={(index === 3).toString()}
            data-index={index}
          />
        ))}
      </div>
      <img
        class="object-fit w-full"
        src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg"
        alt="Ezi unsplash"
        loading="lazy"
      />
      <img
        class="object-fit"
        src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg"
        alt="Ezi unsplash"
        loading="lazy"
      />
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
