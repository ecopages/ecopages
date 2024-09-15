import { RadiantCounter } from '@/components/radiant-counter';
import { BaseLayout } from '@/layouts/base-layout';
import { type EcoComponent, type GetMetadata, html, resolveComponentsScripts } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Home page',
  description: 'This is the homepage of the website',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'framework', 'static'],
});

const HomePage: EcoComponent = () =>
  html`!${BaseLayout({
    class: 'main-content',
    children: html` <h1 class="main-title">Ecopages</h1>
      <p>
        This is a simple example of a static website built with Ecopages<br />
        Current dependencies are:
      </p>

      <ul class="list-disc ml-8">
        <li>
          <code class="font-bold">@ecopages/core</code><br />
          <p class="p-4 rounded-sm">The core library</p>
        </li>
        <li>
          <code class="font-bold">@ecopages/radiant</code><br />
          <p class="p-4 rounded-sm">
            Lightweight library for web components <a class="underline text-blue-600" href="https://radiant.ecopages.app">[Docs]</a>
          </p>
        </li>
        <li>
          <code class="font-bold">@ecopages/bun-postcss-loader</code><br />
          <p class="p-4 rounded-sm">The postcss loader for bundling <a class="underline text-blue-600" href="https://jsr.io/@ecopages/bun-postcss-loader">[Docs]</a></p>
        </li>
      </ul>

      <scripts-injector
        on:interaction="mouseenter,focusin"
        scripts="${resolveComponentsScripts([RadiantCounter])}"
      >
        !${RadiantCounter({
          count: 5,
        })}
      </scripts-injector>`,
  })}`;

HomePage.config = {
  importMeta: import.meta,
  dependencies: {
    stylesheets: ['./index.css'],
    components: [BaseLayout, RadiantCounter],
  },
};

export default HomePage;
