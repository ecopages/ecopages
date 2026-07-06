import { codeToHtml } from 'shiki';

export const configExampleCode = `import path from 'node:path';
import { ConfigBuilder } from '@ecopages/core';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

const baseUrl = import.meta.env?.ECOPAGES_BASE_URL ?? 'http://localhost:3000';

const config = await new ConfigBuilder()
  .setRootDir(import.meta.dir)
  .setBaseUrl(baseUrl)
  .setDefaultMetadata({
    title: 'Ecopages',
    description: 'TypeScript-first static sites on Bun',
  })
  .setIntegrations([ecopagesJsxPlugin()])
  .setProcessors([
    postcssProcessorPlugin(
      tailwindV4Preset({
        referencePath: path.resolve(import.meta.dir, 'src/styles/app.css'),
      })
    ),
  ])
  .build();

export default config;`;

export const componentExampleCode = `import { eco } from '@ecopages/core';

type CounterProps = {
  count: number;
};

export const Counter = eco.component<CounterProps>({
  dependencies: {
    stylesheets: ['./counter.css'],
    lazy: {
      'on:interaction': 'mouseenter,focusin',
      scripts: ['./counter.script.ts'],
    },
  },
  render: ({ count }) => <my-counter count={count}></my-counter>,
});`;

export const pageExampleCode = `import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { Counter } from '@/components/counter';

export default eco.page({
  layout: BaseLayout,
  metadata: () => ({
    title: 'Welcome to Ecopages',
    description: 'A modern static site generator built on Bun',
  }),
  render: () => (
    <section>
      <h1>Build fast static pages with TypeScript</h1>
      <p>
        Start with the Ecopages JSX Integration for first-party defaults,
        then add other Integrations as needed.
      </p>
      <Counter count={5} />
      <a href='/docs/getting-started/introduction'>Read the docs</a>
    </section>
  ),
});`;

export const configExample = await codeToHtml(configExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});

export const componentExample = await codeToHtml(componentExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});

export const pageExample = await codeToHtml(pageExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});
