import { LitCounter } from '@/components/lit-counter';
import '@/components/lit-counter/lit-counter.script';
import { ScriptInjector } from '@/components/script-injector';
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
        <ScriptInjector on:interaction="mouseenter,focusin" scripts={DepsManager.extract(LitCounter, 'scripts').join()}>
          <LitCounter count={8} />
        </ScriptInjector>
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [BaseLayout, ScriptInjector, DepsManager.filter(LitCounter, 'stylesheets')],
});

export default HomePage;
