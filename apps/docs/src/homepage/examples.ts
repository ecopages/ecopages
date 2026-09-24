export const configExampleCode = `import { defineConfig } from '@ecopages/core/config';
import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';
import { postcssProcessorPlugin } from '@ecopages/postcss-processor';
import { tailwindV4Preset } from '@ecopages/postcss-processor/presets/tailwind-v4';

export default defineConfig({
  defaultMetadata: {
    title: 'Ecopages',
    description: 'Pick an Integration, then author Pages',
  },
  integrations: [ecopagesJsxPlugin()],
  processors: [
    postcssProcessorPlugin(
      tailwindV4Preset({
        referencePath: 'src/styles/app.css',
      })
    ),
  ],
});`;

export const componentExampleCode = `import { eco } from '@ecopages/core';

type CounterProps = {
  count: number;
};

export const Counter = eco.component<CounterProps>({
  dependencies: {
    stylesheets: ['./counter.css'],
    scripts: [{ src: './counter.script.ts', ssr: true, lazy: { 'on:interaction': 'mouseenter,focusin' } }],
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
    description: 'A static Page. Add the rest on demand.',
  }),
  render: () => (
    <section>
      <h1>Hello</h1>
      <p>This Page is static HTML. Add a server if you need it.</p>
      <Counter count={5} />
      <a href='/docs/getting-started/introduction'>Read the docs</a>
    </section>
  ),
});`;
