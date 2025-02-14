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
      <p>This is a simple example of a static website built with <a href="https:/ecopages.app/" target="_blank">Ecopages</a>.</p>
      <p>It uses <a href="https://radiant.ecopages.app/" target="_blank">@ecopages/radiant</a> for reactive components.</p>
      <p>Scripts are loaded on demand using the <a href="https://github.com/ecopages/scripts-injector" target="_blank">scripts-injector</a> component.</p>
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
