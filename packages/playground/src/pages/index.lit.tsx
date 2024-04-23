import { Counter } from '@/components/counter';
import Introduction from '@/components/introduction.mdx';
import { LitCounter } from '@/components/lit-counter';
import { LiteCounter } from '@/components/lite-counter';
import { LiteRenderer } from '@/components/lite-renderer';
import { Message } from '@/components/lite-renderer/lite-renderer.templates.kita';
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
        <h1 class="main-title">Home</h1>
        <Introduction />
        <script-injector on:interaction="mouseenter,focusin" scripts={DepsManager.extract(Counter, 'scripts').join()}>
          <Counter />
        </script-injector>
        <script-injector
          on:interaction="mouseenter,focusin"
          scripts={DepsManager.extract(LiteCounter, 'scripts').join()}
        >
          <LiteCounter count={5} />
        </script-injector>
        <script-injector
          on:interaction="mouseenter,focusin"
          scripts={DepsManager.extract(LitCounter, 'scripts').join()}
        >
          <lit-counter class="lit-counter" count={8}></lit-counter>
        </script-injector>
        <LiteRenderer>
          <Message text="Hello from the server" />
        </LiteRenderer>
        <LiteRenderer replace-on-load={true} />
      </>
    </BaseLayout>
  );
};

HomePage.dependencies = DepsManager.collect({
  importMeta: import.meta,
  components: [
    BaseLayout,
    LiteRenderer,
    ScriptInjector,
    DepsManager.filter(Counter, 'stylesheets'),
    DepsManager.filter(LiteCounter, 'stylesheets'),
  ],
});

export default HomePage;
