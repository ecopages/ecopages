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
      <>
        <h1 class="main-title">Images</h1>
        <div class="max-w-80 mx-auto">
          <img
            class="object-fit"
            src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg"
            alt="Ezi unsplash"
            loading="lazy"
          />
        </div>

        <div class="grid grid-cols-4 gap-4 place-items-stretch">
          {Array.from({ length: 4 }).map((_, index) => (
            <img
              class="w-auto"
              src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
              alt="Demo"
              data-static-variant="sm"
            />
          ))}
        </div>
        <div class="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <img
              class="w-auto"
              src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
              alt="Demo"
              data-static-variant="sm"
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
      </>
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
