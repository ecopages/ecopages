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
import { Counter, type CounterProps } from './counter';
import './counter-card.css';

export const CounterCard = eco.component({
  render: ({ count }: CounterProps) => <Counter count={count} />,
});`;

export const pageExampleCode = `import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { CounterCard } from '@/components/counter-card';

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
      <CounterCard count={5} />
      <a href='/docs/getting-started/introduction'>Read the docs</a>
    </section>
  ),
});`;
