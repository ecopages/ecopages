import { ezi76Gu53NklsuUnsplashJpg } from 'ecopages:images';
import { AlpineCounter } from '@/components/alpine-counter';
import Introduction from '@/components/introduction.mdx';
import { LitCounter } from '@/components/lit-counter';
import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';
import { type EcoComponent, type GetMetadata, removeComponentsScripts, resolveComponentsScripts } from '@ecopages/core';
import { EcoImage } from '@ecopages/image-processor/component/html';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () => {
  return (
    <BaseLayout class="main-content">
      <h1 class="main-title">Home</h1>
      <EcoImage {...ezi76Gu53NklsuUnsplashJpg} alt="A computer" width={500} height={500} />
      <Introduction />
      <span class="font-bold text-xl">Alpine Counter</span>
      <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([AlpineCounter])}>
        <AlpineCounter />
      </scripts-injector>
      <span class="font-bold text-xl">Radiant Counter</span>
      <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([RadiantCounter])}>
        <RadiantCounter count={5} />
      </scripts-injector>
      <span class="font-bold text-xl">Lit Counter</span>
      <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([LitCounter])}>
        <lit-counter class="lit-counter" count={8}></lit-counter>
      </scripts-injector>
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
