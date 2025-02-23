import { AlpineCounter } from '@/components/alpine-counter';
import Introduction from '@/components/introduction.mdx';
import { LitCounter } from '@/components/lit-counter';
import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';
import { type EcoComponent, type GetMetadata, removeComponentsScripts, resolveComponentsScripts } from '@ecopages/core';

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
        <h1 class="main-title">Home</h1>
        <Introduction />
        <h4 class="font-bold text-xl">Alpine Counter</h4>
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([AlpineCounter])}>
          <AlpineCounter />
        </scripts-injector>
        <h4 class="font-bold text-xl">Radiant Counter</h4>
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([RadiantCounter])}>
          <RadiantCounter count={5} />
        </scripts-injector>
        <h4 class="font-bold text-xl">Lit Counter</h4>
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([LitCounter])}>
          <lit-counter class="lit-counter" count={8}></lit-counter>
        </scripts-injector>
        <div class="max-w-80 mx-auto">
          <img class="object-fit" src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" />
        </div>
        <div>
          <img class="object-fit" src="/public/assets/images/ezi-76GU53nkLSU-unsplash.jpg" alt="Ezi unsplash" />
        </div>
        <div class="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <img
              class="w-auto"
              src="/public/assets/images/theodore-poncet-QZePhoGqD7w-unsplash.jpg"
              alt="Demo"
              data-fixed-size="sm"
            />
          ))}
        </div>
      </>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [BaseLayout, ...removeComponentsScripts([AlpineCounter, RadiantCounter, LitCounter])],
  },
};

export default HomePage;
