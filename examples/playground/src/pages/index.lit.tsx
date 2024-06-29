import { Counter } from '@/components/counter';
import Introduction from '@/components/introduction.mdx';
import { LitCounter } from '@/components/lit-counter';
import { LiteCounter } from '@/components/lite-counter';
import { LiteRenderer } from '@/components/lite-renderer';
import { Message } from '@/components/lite-renderer/lite-renderer.templates.kita';
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
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([Counter])}>
          <Counter />
        </scripts-injector>
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([LiteCounter])}>
          <LiteCounter count={5} />
        </scripts-injector>
        <scripts-injector on:interaction="mouseenter,focusin" scripts={resolveComponentsScripts([LitCounter])}>
          <lit-counter class="lit-counter" count={8}></lit-counter>
        </scripts-injector>
        <scripts-injector
          on:interaction="mouseenter,focusin"
          scripts={resolveComponentsScripts([LiteRenderer, Message])}
        >
          <LiteRenderer>
            <Message text="Hello from the server" />
          </LiteRenderer>
        </scripts-injector>
      </>
    </BaseLayout>
  );
};

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [BaseLayout, ...removeComponentsScripts([Counter, LiteRenderer, LiteCounter, Message])],
  },
};

export default HomePage;
