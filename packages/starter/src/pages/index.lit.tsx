import { LitCounter } from '@/components/lit-counter';
import { BaseLayout } from '@/layouts/base-layout';
import { DepsManager, type EcoComponent, type GetMetadata } from '@eco-pages/core';

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
        <h1 class="main-title">Eco pages</h1>
        <scripts-injector
          on:interaction="mouseenter,focusin"
          scripts={DepsManager.extract(LitCounter, 'scripts').join()}
        >
          <lit-counter class="lit-counter" count={8}></lit-counter>
        </scripts-injector>
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, DepsManager.filter(LitCounter, 'stylesheets')],
});

export default HomePage;
